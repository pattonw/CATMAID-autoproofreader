from django.http import JsonResponse
from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole
from rest_framework.views import APIView

from autoproofreader.models import DiluvianModel, DiluvianModelSerializer, ConfigFile


class DiluvianModelAPI(APIView):
    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def put(self, request, project_id):
        warnings = []

        name = request.POST.get("name", request.data.get("name", None))
        server_id = request.POST.get("server_id", request.data.get("server_id", None))
        model_source_path = request.POST.get(
            "model_source_path", request.data.get("model_source_path", None)
        )
        config = request.POST.get("config", request.data.get("config", None))

        params = [name, server_id, model_source_path]

        if any([x is None for x in params]):
            return JsonResponse({"success": False, "results": request.POST})

        if config is not None:
            model_config = ConfigFile(
                user_id=request.user.id, project_id=project_id, config=config
            )
            model_config.save()
            config_id = model_config.id
        else:
            warnings.append(
                "Model created with no configuration files. This "
                + "will make it much harder to reproduce your "
                + "results later."
            )
            config_id = None
        model = DiluvianModel(
            name=name,
            server_id=server_id,
            model_source_path=model_source_path,
            config_id=config_id,
            user_id=request.user.id,
            project_id=project_id,
        )
        model.save()

        return JsonResponse(
            {"success": True, "warnings": warnings, "model_id": model.id}
        )

    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def get(self, request, project_id):
        """
        List all available autoproofreader models
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
                server_id,
                model_source_path,
                config_id,
            ]
        """
        model_id = request.query_params.get(
            "model_id", request.data.get("model_id", None)
        )

        if model_id is not None:
            query_set = DiluvianModel.objects.filter(id=model_id, prject=project_id)
        else:
            query_set = DiluvianModel.objects.filter(project=project_id)

        return JsonResponse(
            DiluvianModelSerializer(query_set, many=True).data,
            safe=False,
            json_dumps_params={"sort_keys": True, "indent": 4},
        )

    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def delete(self, request, project_id):
        # can_edit_or_fail(request.user, point_id, "point")
        model_id = request.query_params.get(
            "model_id", request.data.get("model_id", None)
        )

        model = get_object_or_404(DiluvianModel, id=model_id)
        model.delete()

        return JsonResponse({"success": True})
