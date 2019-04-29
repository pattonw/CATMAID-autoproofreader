from django.http import JsonResponse, HttpResponseNotFound
from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole
from autoproofreader.models import ProofreadTreeNodes
from rest_framework.views import APIView


class ProofreadTreeNodeAPI(APIView):
    @method_decorator(requires_user_role(UserRole.Browse))
    def get(self, request, project_id):
        """
        List all available volume configurations
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
        returns: List of lists of the form:
            [
                id,
                user_id,
                project_id,
                creation_time,
                edition_time,
                name,
                config,
            ]
        """
        result_id = request.query_params.get(
            "result_id", request.data.get("result_id", None)
        )
        if result_id is not None:
            nodes = ProofreadTreeNodes.objects.filter(result_id=result_id)
        else:
            nodes = ProofreadTreeNodes.objects.all()

        return JsonResponse(
            nodes, safe=False, json_dumps_params={"sort_keys": True, "indent": 4}
        )

    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def delete(self, request, project_id):
        result_id = request.query_params.get(
            "result_id", request.data.get("result_id", None)
        )

        nodes = ProofreadTreeNodes.objects.filter(result_id=result_id)
        if len(nodes) < 1:
            return HttpResponseNotFound(
                "No nodes found for result {}".format(result_id)
            )
        nodes.delete()

        return JsonResponse({"success": True})
