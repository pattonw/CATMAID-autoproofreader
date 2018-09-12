# -*- coding: utf-8 -*-
import subprocess
from pathlib import Path
import json
import numpy as np

from django.conf import settings
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.db import connection

from catmaid.control.volume import get_volume_instance
from catmaid.control.authentication import requires_user_role
from catmaid.models import Message, User, UserRole
from catmaid.control.message import notify_user

from celery.task import task

from rest_framework.views import APIView

from floodfilling.models import FloodfillResults, FloodfillConfig
from floodfilling.control import compute_server


# The path were server side exported files get stored in
output_path = Path(settings.MEDIA_ROOT, settings.MEDIA_EXPORT_SUBDIRECTORY)


class FloodfillingTaskAPI(APIView):
    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def put(self, request, project_id):
        """
        Flood fill a skeleton.
        Files:
        job_config.json
        volume.toml
        diluvian_config.toml
        skeleton.csv
        """

        files = {f.name: f.read().decode("utf-8") for f in request.FILES.values()}
        # pop the job_config since that is needed here, the rest of the files
        # will get passed through to diluvian
        job_config = json.loads(files.pop("job_config.json"))

        # the name of the job, used for storing temporary files
        # and refering to past runs
        job_name = job_config.get("name", "default")

        # If the temporary directory doesn't exist, create it
        media_folder = Path(settings.MEDIA_ROOT)
        if not (media_folder / job_name).exists():
            (media_folder / job_name).mkdir()
        local_temp_dir = media_folder / job_name

        # Create a copy of the files sent in the request in the
        # temporary directory so that it can be copied with scp
        # in the async function
        for f in request.FILES.values():
            file_path = local_temp_dir / f.name
            file_path.write_text(f.read().decode("utf-8"))

        # HARD-CODED SETTINGS
        # TODO: move these to appropriate locations
        ssh_key_path = settings.SSH_KEY_PATH

        print(job_config)

        # create a floodfill config object if necessary and pass
        # it to the floodfill results object
        diluvian_config = FloodfillConfig(
            user_id=request.user.id,
            project_id=project_id,
            config=files["diluvian_config.toml"],
        )
        diluvian_config.save()

        result = FloodfillResults(
            user_id=request.user.id,
            project_id=project_id,
            config_id=diluvian_config.id,
            skeleton_id=job_config["skeleton_id"],
            skeleton_csv=files["skeleton.csv"],
            model_id=job_config["model_id"],
            name=job_name,
            status="queued",
        )
        result.save()

        return JsonResponse({"status": "queued"})

        # Flood filling async function
        x = flood_fill_async.delay(
            project_id, request.user.id, ssh_key_path, local_temp_dir, server, job_name
        )

        # Send a response to let the user know the async funcion has started
        return JsonResponse({"task_id": x.task_id})


@task()
def flood_fill_async(
    project_id, user_id, ssh_key_path, local_temp_dir, server, job_name
):

    setup = "scp -i {ssh_key_path} -pr {local_dir} {server_address}:{server_diluvian_dir}/{server_results_dir}/{job_dir}".format(
        **{
            "local_dir": local_temp_dir,
            "server_address": server["address"],
            "server_diluvian_dir": server["diluvian_path"],
            "server_results_dir": server["results_dir"],
            "job_dir": job_name,
            "ssh_key_path": ssh_key_path,
        }
    )
    files = {}
    for f in local_temp_dir.iterdir():
        files[f.name.split(".")[0]] = Path(
            "~/", server["diluvian_path"], server["results_dir"], job_name, f.name
        )

    flood_fill = """
    ssh -i {ssh_key_path} {server}
    source {server_ff_env_path}
    cd  {server_diluvian_dir}
    python -m diluvian skeleton-fill-parallel {skeleton_file} -s {output_file} -m {model_file} -c {config_file} -v {volume_file} --no-in-memory -l WARNING --max-moves 3
    """.format(
        **{
            "ssh_key_path": ssh_key_path,
            "server": server["address"],
            "server_ff_env_path": server["env_source"],
            "server_diluvian_dir": server["diluvian_path"],
            "model_file": server["model_file"],
            "output_file": Path(server["results_dir"], job_name, job_name + "_output"),
            "skeleton_file": files["skeleton"],
            "config_file": files["config"],
            "volume_file": files["volume"],
        }
    )

    cleanup = """
    scp -i {ssh_key_path} {server}:{server_diluvian_dir}/{server_results_dir}/{server_job_dir}/{output_file_name}.npy {local_temp_dir}
    ssh -i {ssh_key_path} {server}
    rm -r {server_diluvian_dir}/{server_results_dir}/{server_job_dir}
    """.format(
        **{
            "ssh_key_path": ssh_key_path,
            "server": server["address"],
            "server_diluvian_dir": server["diluvian_path"],
            "server_results_dir": server["results_dir"],
            "server_job_dir": job_name,
            "output_file_name": job_name + "_output",
            "local_temp_dir": local_temp_dir,
        }
    )

    process = subprocess.Popen(
        "/bin/bash", stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf8"
    )
    out, err = process.communicate(setup)
    print(out)

    process = subprocess.Popen(
        "/bin/bash", stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf8"
    )
    out, err = process.communicate(flood_fill)
    print(out)

    process = subprocess.Popen(
        "/bin/bash", stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf8"
    )
    out, err = process.communicate(cleanup)
    print(out)

    # actually import the volume into the database
    if False:
        importFloodFilledVolume(
            project_id,
            user_id,
            "{}/{}.npy".format(local_temp_dir, job_name + "_output"),
        )

    if False:
        msg = Message()
        msg.user = User.objects.get(pk=int(user_id))
        msg.read = False

        msg.title = "ASYNC JOB MESSAGE HERE"
        msg.text = "IM DOING SOME STUFF, CHECK IT OUT"
        msg.action = "localhost:8000"

        notify_user(user_id, msg.id, msg.title)

    return "complete"


def importFloodFilledVolume(project_id, user_id, ff_output_file):
    x = np.load(ff_output_file)
    verts = x[0]
    faces = x[1]
    verts = [[v[i] for i in range(len(v))] for v in verts]
    faces = [list(f) for f in faces]

    x = [verts, faces]

    options = {"type": "trimesh", "mesh": x, "title": "skeleton_test"}
    volume = get_volume_instance(project_id, user_id, options)
    volume.save()

    return JsonResponse({"success": True})


class FloodfillingResultsAPI(APIView):
    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
        """
        List all available floodfilling models
        ---
        parameters:
          - name: project_id
            description: Project of the returned configurations
            type: integer
            paramType: path
            required: true
          - name: model_id
            description: If available, return only the model associated with model_id
            type: int
            paramType: form
            required: false
            defaultValue: false
        """
        result_id = request.query_params.get("result_id", None)
        result = self.get_results(result_id)

        return JsonResponse(
            result, safe=False, json_dumps_params={"sort_keys": True, "indent": 4}
        )

    def get_models(self, result_id=None):
        cursor = connection.cursor()
        if result_id is not None:
            cursor.execute(
                """
                SELECT * FROM floodfill_result
                WHERE id = {}
                """.format(
                    result_id
                )
            )
        else:
            cursor.execute(
                """
                SELECT * FROM floodfill_model
                """
            )
        return cursor.fetchall()
