from django.http import JsonResponse
from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.conf import settings

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole
from autoproofreader.models import ComputeServer
from rest_framework.views import APIView

import subprocess


class ComputeServerAPI(APIView):
    @method_decorator(requires_user_role(UserRole.Admin))
    def put(self, request, project_id):
        address = request.POST.get("address")
        if "name" in request.POST:
            name = request.POST.get("name")
        else:
            name = address.split(".")[0]
        environment_source_path = request.POST.get("environment_source_path", None)
        diluvian_path = request.POST.get("diluvian_path", None)
        results_directory = request.POST.get("results_directory", None)

        server = ComputeServer(
            name=name,
            address=address,
            editor=request.user,
            environment_source_path=environment_source_path,
            diluvian_path=diluvian_path,
            results_directory=results_directory,
        )
        server.save()

        return JsonResponse({"success": True})

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
        """
        List all available compute servers
        ---
        parameters:
          - name: project_id
            description: Project of the returned configurations
            type: integer
            paramType: path
            required: true
          - name: server_id
            description: If available, return only the server associated with server_id
            type: int
            paramType: form
            required: false
            defaultValue: false
        returns: List of lists of the form:
            [
                id,
                name,
                address,
                editor_id,
                edition_time,
                environment_source_path,
                diluvian_path,
                results_directory,
            ]
        """
        server_id = request.query_params.get("server_id", None)
        result = self.get_servers(server_id)

        return JsonResponse(
            result, safe=False, json_dumps_params={"sort_keys": True, "indent": 4}
        )

    @method_decorator(requires_user_role(UserRole.Admin))
    def delete(self, request, project_id):
        # can_edit_or_fail(request.user, point_id, "point")
        server_id = request.query_params.get("server_id", None)

        return JsonResponse(
            {
                "asked": server_id,
                "servers": [server.id for server in ComputeServer.objects.all()],
            }
        )

        server = get_object_or_404(ComputeServer, id=server_id)
        server.delete()

        return JsonResponse({"success": True})

    def get_servers(self, server_id=None):
        cursor = connection.cursor()
        if server_id is not None:
            cursor.execute(
                """
                SELECT * FROM autoproofreader_computeserver
                WHERE id = {}
                """.format(
                    server_id
                )
            )
        else:
            cursor.execute(
                """
                SELECT * FROM autoproofreader_computeserver
                """
            )
        desc = cursor.description
        return [dict(zip([col[0] for col in desc], row)) for row in cursor.fetchall()]


class GPUUtilAPI(APIView):
    """
    API for querying gpu status on the server. Could be used to inform user
    whether server is currently in use, or which gpus are currently free.
    """

    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
        """
        get gpu information from a server
        ---
        parameters:
          - name: project_id
            description: Project of the returned configurations
            type: integer
            paramType: path
            required: true
          - name: server_id
            description: If available, return only the server associated with server_id
            type: int
            paramType: form
            required: true
            defaultValue: false
        """

        out = GPUUtilAPI._query_server(request.query_params.get("server_id", None))

        return JsonResponse(
            out, safe=False, json_dumps_params={"sort_keys": True, "indent": 4}
        )

    def _query_server(server_id):
        fields = [
            ("index", int),
            ("uuid", str),
            ("utilization.gpu", float),
            ("memory.total", int),
            ("memory.used", int),
            ("memory.free", int),
            ("driver_version", str),
            ("name", str),
            ("gpu_serial", str),
        ]

        server = ComputeServerAPI.get_servers(server_id)[0]

        bash_script = (
            "ssh -i {} {}\n".format(settings.SSH_KEY_PATH, server["address"])
            + "nvidia-smi "
            + "--query-gpu={} ".format(",".join([x[0] for x in fields]))
            + "--format=csv,noheader,nounits"
        )

        process = subprocess.Popen(
            "/bin/bash", stdin=subprocess.PIPE, stdout=subprocess.PIPE, encoding="utf8"
        )
        out, err = process.communicate(bash_script)
        return GPUUtilAPI._parse_query(out, fields)

    def _parse_query(out, fields):
        out = out.strip()
        out = out.split("\n")
        out = list(map(lambda x: x.split(", "), out))
        out = filter(lambda x: len(x) == len(fields), out)

        def is_valid(x, x_type):
            try:
                x_type(x)
                return True
            except ValueError:
                return False

        out = filter(lambda x: all(list(map(is_valid, x, [f[1] for f in fields]))), out)
        out = {
            x[0]: {fields[i + 1]: x[i + 1] for i in range(len(fields) - 1)} for x in out
        }
        return out
