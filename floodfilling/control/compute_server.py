from django.http import JsonResponse
from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole
from floodfilling.models import ComputeServer
from rest_framework.views import APIView


class ComputeServerAPI(APIView):
    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
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

    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def delete(self, request, project_id):
        # can_edit_or_fail(request.user, point_id, "point")
        server_id = request.query_params.get("server_id", None)

        server = get_object_or_404(ComputeServer, id=server_id)
        server.delete()

        return JsonResponse({"success": True})

    def get_servers(self, server_id=None):
        cursor = connection.cursor()
        if server_id is not None:
            cursor.execute(
                """
                SELECT * FROM compute_server
                WHERE id = {}
                """.format(
                    server_id
                )
            )
        else:
            cursor.execute(
                """
                SELECT * FROM compute_server
                """
            )
        return cursor.fetchall()
