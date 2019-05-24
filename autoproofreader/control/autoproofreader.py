# -*- coding: utf-8 -*-
import datetime
import subprocess
from pathlib import Path
import json
import pickle
import pytz
from collections import namedtuple
import csv
import logging

from django.conf import settings
from django.http import JsonResponse, HttpResponseNotFound
from django.utils.decorators import method_decorator
from django.db.models import Q
from django.shortcuts import get_object_or_404

from catmaid.consumers import msg_user
from catmaid.control.authentication import requires_user_role
from catmaid.models import Message, User, UserRole, Volume
from catmaid.control.message import notify_user
from catmaid.control.volume import (
    TriangleMeshVolume,
    InvalidSTLError,
    _stl_ascii_to_indexed_triangles,
)

from celery.task import task

from rest_framework.views import APIView
from rest_framework.decorators import api_view

from autoproofreader.models import (
    AutoproofreaderResult,
    AutoproofreaderResultSerializer,
    ConfigFile,
    ComputeServer,
    DiluvianModel,
    ProofreadTreeNodes,
)
from autoproofreader.control.compute_server import GPUUtilAPI


# The path were server side exported files get stored in
output_path = Path(settings.MEDIA_ROOT, settings.MEDIA_EXPORT_SUBDIRECTORY)


class AutoproofreaderTaskAPI(APIView):
    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def put(self, request, project_id):
        """Create an autoproofreading job.

        If a user has permission to queue compute tasks, this api can be
        used to submit a skeleton allong with sufficient information to
        access localized segmentations and retrieve a ranking of which
        sections of the neuron are most likely to contain errors.

        ---
        parameters:
          - name: job_config.json
            description: Config file containing job initialization information
            required: true
            type: file
            paramType: form
          - name: sarbor_config.toml
            description: File detailing sarbor execution configuration
            required: true
            type: file
            paramType: form
          - name: skeleton.csv
            description: Csv file containing rows of (node_id, parent_id, x, y, z)
            required: true
            type: file
            paramType: form
          - name: all_settings.toml
            description: File containing a full set of settings for this job
            required: true
            type: file
            paramType: form
          - name: volume.toml
            description: Contains configuration for Diluvian volume
            required: false
            type: file
            paramType: form
          - name: diluvian_config.toml
            description: Contains job specific changes to a trained models config file
            required: false
            type: file
            paramType: form
          - name: cached_lsd_config.toml
            description: Contains configuration for a job running on cached lsd segmentations
            required: false
            type: file
            paramType: form
        """

        files = {f.name: f.read().decode("utf-8") for f in request.FILES.values()}
        all_settings, job_config, job_name, local_temp_dir = self._handle_files(files)
        settings_config = ConfigFile(
            user_id=request.user.id, project_id=project_id, config=all_settings
        )
        settings_config.save()

        # retrieve necessary paths from the chosen server and model
        server = ComputeServer.objects.get(id=job_config["server_id"])
        server_paths = {
            "address": server.address,
            "working_dir": server.diluvian_path[2:]
            if server.diluvian_path.startswith("~/")
            else server.diluvian_path,
            "results_dir": server.results_directory,
            "env_source": server.environment_source_path,
        }

        # Get the ssh key for the desired server
        ssh_key = settings.SSH_KEY_PATH + "/" + server.ssh_key
        ssh_user = server.ssh_user

        # store a job in the database now so that information about
        # ongoing jobs can be retrieved.
        # gpus = self._get_gpus(job_config)
        # if self._check_gpu_conflict(gpus):
        #     raise Exception("Not enough compute resources for this job")
        result = AutoproofreaderResult(
            user_id=request.user.id,
            project_id=project_id,
            config_id=settings_config.id,
            skeleton_id=job_config["skeleton_id"],
            skeleton_csv=files["skeleton.csv"],
            model_id=job_config["model_id"],
            name=job_name,
            status="queued",
            private=True,
            # gpus=gpus,
        )
        result.save()

        media_folder = Path(settings.MEDIA_ROOT)
        segmentations_dir = (
            media_folder / "proofreading_segmentations" / str(result.uuid)
        )

        msg_user(request.user.id, "autoproofreader-result-update", {"status": "queued"})

        # if self._check_gpu_conflict():
        #     raise Exception("Not enough compute resources for this job")

        if job_config.get("segmentation_type", None) == "diluvian":

            # retrieve the configurations used during the chosen models training.
            # this is used as the base configuration when running since most
            # settings should not be changed or are irrelevant to autoproofreading a
            # skeleton. The settings that do need to be overridden are handled
            # by the config generated by the widget.
            model = DiluvianModel.objects.get(id=job_config["model_id"])
            if model.config_id is not None:
                query = ConfigFile.objects.get(id=int(model.config_id))
                model_config = query.config
                file_path = local_temp_dir / "model_config.toml"
                file_path.write_text(model_config)

            server_paths["model_file"] = model.model_source_path

        if job_config.get("segmentation_type", None) is not None:
            # Retrieve segmentation
            x = query_segmentation_async.delay(
                result,
                project_id,
                request.user.id,
                ssh_key,
                ssh_user,
                local_temp_dir,
                segmentations_dir,
                server_paths,
                job_name,
                job_config["segmentation_type"],
            )
        else:
            raise ValueError("Segmentation type not available: {}".format(job_config))

        # Send a response to let the user know the async funcion has started
        return JsonResponse({"task_id": x.task_id, "status": "queued"})

    def _handle_files(self, files):
        # Check for basic files
        for x in [
            "job_config.json",
            "sarbor_config.toml",
            "skeleton.csv",
            "all_settings.toml",
        ]:
            if x not in files.keys():
                raise Exception(x + " is missing!")

        job_config = json.loads(files["job_config.json"])
        all_settings = files["all_settings.toml"]

        # the name of the job, used for storing temporary files
        # and refering to past runs
        job_name = self._get_job_name(job_config)

        # If the temporary directory doesn't exist, create it
        media_folder = Path(settings.MEDIA_ROOT)
        if not (media_folder / job_name).exists():
            (media_folder / job_name).mkdir()
        local_temp_dir = media_folder / job_name

        # Create a copy of the files sent in the request in the
        # temporary directory so that it can be copied with scp
        # in the async function
        for f in files:
            file_path = local_temp_dir / f
            file_path.write_text(files[f])

        return all_settings, job_config, job_name, local_temp_dir

    def _get_job_name(self, config):
        """
        Get the name of a job. If the job_name field is not provided generate a default
        job name based on the date and the skeleton id.
        """
        name = config.get("job_name", "")
        if len(name) == 0:
            skid = str(config.get("skeleton_id", None))
            date = str(datetime.datetime.now(pytz.utc).date())
            if skid is None:
                raise Exception("missing skeleton id!")
            name = skid + "_" + date

        i = len(AutoproofreaderResult.objects.filter(name__startswith=name))
        if i > 0:
            return "{}_{}".format(name, i)
        else:
            return name

    def _get_gpus(self, config):
        gpus = GPUUtilAPI._query_server(config["server_id"])
        config_gpus = config.get("gpus", [])
        if len(config_gpus) == 0:
            config_gpus = list(range(len(gpus)))
        for g in config_gpus:
            if str(g) not in gpus.keys():
                raise Exception(
                    "There is no gpu with id ({}) on the chosen server".format(g)
                )
        usage = [True if (i in config_gpus) else False for i in range(len(gpus))]
        return usage

    def _check_gpu_conflict(self, gpus=None):
        # returns True if there is a conflict
        ongoing_jobs = AutoproofreaderResult.objects.filter(status="queued")
        if len(ongoing_jobs) == 0:
            # jobs will not have taken compute resources if there
            # are no other jobs. We should probably still check gpu
            # usage stats to see if the gpus are unavailable for some
            # reason other than flood filling jobs.
            return False
        gpu_utils = [job.gpus for job in ongoing_jobs]
        if gpus is not None:
            gpu_utils.append(gpus)

        # There is a conflict if at least one gpu is claimed by at least 2 jobs
        return (
            len(list(filter(lambda x: x > 1, map(lambda *x: sum(x), *gpu_utils)))) > 0
        )

    def _get_diluvian_config(self, user_id, project_id, config):
        """
        get a configuration object for this project. It may make sense to reuse
        configurations accross runs, but that is currently not supported.
        """
        return ConfigFile(user_id=user_id, project_id=project_id, config=config)


@task()
def query_segmentation_async(
    result,
    project_id,
    user_id,
    ssh_key,
    ssh_user,
    local_temp_dir,
    segmentations_dir,
    server,
    job_name,
    job_type,
):
    result.status = "computing"
    result.save()
    msg_user(user_id, "autoproofreader-result-update", {"status": "computing"})

    # copy temp files from django local temp media storage to server temp storage
    setup = (
        "scp -i {ssh_key} -pr {local_dir} "
        + "{ssh_user}@{server_address}:{server_results_dir}/{job_dir}"
    ).format(
        **{
            "local_dir": local_temp_dir,
            "server_address": server["address"],
            "server_results_dir": server["results_dir"],
            "job_dir": job_name,
            "ssh_key": ssh_key,
            "ssh_user": ssh_user,
        }
    )
    files = {}
    for f in local_temp_dir.iterdir():
        files[f.name.split(".")[0]] = Path(
            "~/", server["results_dir"], job_name, f.name
        )

    if job_type == "diluvian":
        extra_parameters = (
            "--model-weights-file {model_file} "
            + "--model-training-config {model_config_file} "
            + "--model-job-config {job_config_file} "
            + "--volume-file {volume_file} "
        ).format(
            **{
                "model_file": server["model_file"],
                "model_config_file": files["model_config"],
                "job_config_file": files["diluvian_config"],
                "volume_file": files["volume"],
            }
        )
    elif job_type == "cached_lsd":
        extra_parameters = "--cached-lsd-config {} ".format(files["cached_lsd_config"])
    else:
        extra_parameters = ""

    # connect to the server and run the autoproofreader algorithm on the provided skeleton
    query_seg = (
        "ssh -i {ssh_key} {ssh_user}@{server}\n"
        + "source {server_ff_env_path}\n"
        + "sarbor-error-detector "
        + "--skeleton-csv {skeleton_file} "
        + "--sarbor-config {sarbor_config} "
        + "--output-file {output_file} "
        + "{segmentation_type} "
        + "{type_parameters}"
    ).format(
        **{
            "ssh_key": ssh_key,
            "ssh_user": ssh_user,
            "server": server["address"],
            "server_ff_env_path": server["env_source"],
            "skeleton_file": files["skeleton"],
            "sarbor_config": files["sarbor_config"],
            "output_file": Path(server["results_dir"], job_name, "outputs"),
            "segmentation_type": job_type.replace("_", "-"),
            "type_parameters": extra_parameters,
        }
    )

    # Copy the numpy file containing the volume mesh and the csv containing the node connections
    # predicted by the autoproofreader run.

    fetch_files = (
        "scp -i {ssh_key} -r {ssh_user}@{server}:"
        + "{server_results_dir}/{server_job_dir}/* {local_temp_dir}\n"
    ).format(
        **{
            "ssh_key": ssh_key,
            "ssh_user": ssh_user,
            "server": server["address"],
            "server_results_dir": server["results_dir"],
            "server_job_dir": job_name,
            "local_temp_dir": local_temp_dir,
        }
    )

    process = subprocess.Popen(
        "/bin/bash", stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf8"
    )
    out, err = process.communicate(setup)
    logging.info(out)

    process = subprocess.Popen(
        "/bin/bash", stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf8"
    )
    out, err = process.communicate(query_seg)
    logging.info(out)

    process = subprocess.Popen(
        "/bin/bash", stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf8"
    )
    out, err = process.communicate(fetch_files)
    logging.info(out)

    nodes_path = Path(local_temp_dir, "outputs", "nodes.obj")
    Node = namedtuple("Node", ["node_id", "parent_id", "x", "y", "z"])
    # b is the branch score. c is the connectivity score
    Ranking = namedtuple(
        "Ranking", ["node_id", "parent_id", "c", "b", "b_dx", "b_dy", "b_dz"]
    )
    Combined = namedtuple(
        "Combined",
        ["node_id", "parent_id", "x", "y", "z", "b", "c", "b_dx", "b_dy", "b_dz"],
    )

    # Nodes are mandatory
    if nodes_path.exists():
        nodes = {row[0]: Node(*row) for row in pickle.load(nodes_path.open("rb"))}
    else:
        result.status = "failed"
        result.save()
        return "failed"

    rankings_path = Path(local_temp_dir, "outputs", "rankings.obj")
    # Rankings are mandatory
    if rankings_path.exists():
        with rankings_path.open("r") as f:
            rankings = {
                row[0]: Ranking(*row) for row in pickle.load(rankings_path.open("rb"))
            }
            node_data = [
                Combined(**{**nodes[nid]._asdict(), **rankings[nid]._asdict()})
                for nid in nodes.keys()
            ]
            proofread_nodes = [
                ProofreadTreeNodes(
                    node_id=row.node_id,
                    parent_id=row.parent_id,
                    x=row.x,
                    y=row.y,
                    z=row.z,
                    connectivity_score=row.c,
                    branch_score=row.b,
                    branch_dx=row.b_dx,
                    branch_dy=row.b_dy,
                    branch_dz=row.b_dz,
                    reviewed=False,
                    result=result,
                    user_id=user_id,
                    project_id=project_id,
                    editor_id=user_id,
                )
                for row in node_data
            ]
            ProofreadTreeNodes.objects.bulk_create(proofread_nodes)
    else:
        result.status = "failed"
        result.save()
        return "failed"

    mesh_path = Path(local_temp_dir, "outputs", "mesh.stl")
    # Mesh is optional
    if mesh_path.exists():
        with mesh_path.open("r") as f:
            stl_str = f.read()

            try:
                vertices, triangles = _stl_ascii_to_indexed_triangles(stl_str)
            except InvalidSTLError as e:
                raise ValueError("Invalid STL file ({})".format(str(e)))

            mesh = TriangleMeshVolume(
                project_id,
                user_id,
                {"type": "trimesh", "title": job_name, "mesh": [vertices, triangles]},
            )
            mesh_volume = mesh.save()
            result.volume = Volume.objects.get(id=mesh_volume)

    segmentation_path = Path(local_temp_dir, "outputs", "segmentations.n5")
    segmentation_dir = Path(segmentations_dir)
    if segmentation_path.exists():
        segmentation_dir.mkdir(parents=True, exist_ok=True)
        segmentation_path.rename(segmentation_dir / "segmentations.n5")

    cleanup = (
        "rm -r {local_temp_dir}\n"
        + "ssh -i {ssh_key} {ssh_user}@{server}\n"
        + "rm -r {server_results_dir}/{server_job_dir}"
    ).format(
        **{
            "ssh_key": ssh_key,
            "ssh_user": ssh_user,
            "server": server["address"],
            "server_results_dir": server["results_dir"],
            "server_job_dir": job_name,
            "local_temp_dir": local_temp_dir,
        }
    )

    process = subprocess.Popen(
        "/bin/bash", stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf8"
    )
    out, err = process.communicate(cleanup)
    logging.info(out)

    msg = Message()
    msg.user = User.objects.get(pk=int(user_id))
    msg.read = False

    msg.title = "Job {} complete!"
    msg.text = "IM DOING SOME STUFF, CHECK IT OUT"
    msg.action = "localhost:8000"

    notify_user(user_id, msg.id, msg.title)

    result.completion_time = datetime.datetime.now(pytz.utc)
    result.status = "complete"
    result.save()

    msg_user(user_id, "autoproofreader-result-update", {"status": "completed"})

    return "complete"


@api_view(["GET"])
@requires_user_role(UserRole.Browse)
def get_result_uuid(request, project_id):
    """Retrieve the uuid of a result.

    The UUID is used to store the results of a job in a secure
    location so that only those with permission to obtain
    the UUID can see the job results.
    ---
    parameters:
      - name: result_id
        description: ID of result for which you want the uuid.
        type: integer
        required: true
        paramType: form
    """
    result_id = request.query_params.get(
        "result_id", request.data.get("result_id", None)
    )
    query_set = AutoproofreaderResult.objects.filter(
        Q(project=project_id)
        & Q(id=result_id)
        & (Q(user=request.user.id) | Q(private=False))
    )
    if len(query_set) == 1:
        return JsonResponse(query_set[0].uuid, safe=False)

    return HttpResponseNotFound("No results found with id {}".format(result_id))


class AutoproofreaderResultAPI(APIView):
    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
        """Retrieve past job results.

        Retrieve information on previous jobs. This includes jobs
        that have not yet completed their computations.
        ---
        parameters:
            - name: result_id
            description: ID of result to retrieve. If not provided retrieve all results
            type: integer
            paramType: path
        """
        result_id = request.query_params.get(
            "result_id", request.data.get("result_id", None)
        )
        if result_id is not None:
            query_set = AutoproofreaderResult.objects.filter(
                Q(project=project_id)
                & Q(id=result_id)
                & (Q(user=request.user.id) | Q(private=False))
            )
            if len(query_set) == 0:
                return HttpResponseNotFound(
                    "No results found with id {}".format(result_id)
                )
        else:
            query_set = AutoproofreaderResult.objects.filter(
                Q(project=project_id) & (Q(user=request.user.id) | Q(private=False))
            )
            if len(query_set) == 0 and result_id is not None:
                return JsonResponse([], safe=False)

        return JsonResponse(
            AutoproofreaderResultSerializer(query_set, many=True).data,
            safe=False,
            json_dumps_params={"sort_keys": True, "indent": 4},
        )

    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def patch(self, request, project_id):
        """Edit an existing result.

        This api is used to toggle the 'permanent' and 'private' flags
        of a result.
        ---
        parameters:
            - name: result_id
            description: ID of result to edit.
            required: true
            type: integer
            paramType: form
            -name: private
            description: |
              Whether to toggle the 'private' flag. If checked
              only the user who started this job can view its
              results.
            type: boolean
            paramType: form
            -name: permanent
            description: |
              Whether to toggle the 'permanent' flag. If not
              checked, this result and its data might be
              deleted to make room for others.
            type: boolean
            paramType: form
        """
        result_id = request.query_params.get(
            "result_id", request.data.get("result_id", None)
        )
        if request.query_params.get("private", request.data.get("private", False)):
            # toggle privacy setting if result belongs to this user.
            result = get_object_or_404(
                AutoproofreaderResult,
                id=result_id,
                user=request.user.id,
                project=project_id,
            )
            result.private = not result.private
            result.save()
        if request.query_params.get("permanent", request.data.get("permanent", False)):
            # toggle permanent setting if result belongs to user or is not private
            query_set = AutoproofreaderResult.objects.filter(
                Q(id=result_id)
                & Q(project=project_id)
                & (Q(user=request.user.id) | Q(private=False))
            )
            if len(query_set) == 0:
                return HttpResponseNotFound()
            if len(query_set) > 1:
                raise ValueError("non unique ids found")
            result = query_set[0]
            result.permanent = not result.permanent
            result.save()

        return JsonResponse({"private": result.private, "permanent": result.permanent})

    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def delete(self, request, project_id):
        """Delete an existing result.

        ---
        parameters:
            - name: result_id
            description: ID of result to delete.
            required: true
            type: integer
            paramType: form
        """
        # can_edit_or_fail(request.user, point_id, "point")
        result_id = request.query_params.get(
            "result_id", request.data.get("result_id", None)
        )
        result = get_object_or_404(
            AutoproofreaderResult,
            id=result_id,
            user_id=request.user.id,
            project=project_id,
        )
        result.delete()
        return JsonResponse({"success": True})
