from django.http import JsonResponse
from django.db import connection
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole
from rest_framework.views import APIView

from autoproofreader.models import ImageVolumeConfig, ImageVolumeConfigSerializer


class ImageVolumeConfigAPI(APIView):
    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def put(self, request, project_id):
        warnings = []

        name = request.POST.get("name", request.data.get("name", None))
        config = request.POST.get("config", request.data.get("config", None))

        params = [name, config]

        if any([x is None for x in params]):
            return JsonResponse({"success": False, "results": request.data})

        image_volume_config = ImageVolumeConfig(
            name=name, config=config, user_id=request.user.id, project_id=project_id
        )
        image_volume_config.save()

        return JsonResponse(
            {
                "success": True,
                "warnings": warnings,
                "image_volume_config_id": image_volume_config.id,
            }
        )

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
        image_volume_config_id = request.query_params.get(
            "image_volume_config_id", request.data.get("image_volume_config_id", None)
        )
        if image_volume_config_id is not None:
            query_set = ImageVolumeConfig.objects.filter(
                id=image_volume_config_id, project=project_id
            )
        else:
            query_set = ImageVolumeConfig.objects.filter(project=project_id)

        return JsonResponse(
            ImageVolumeConfigSerializer(query_set, many=True).data,
            safe=False,
            json_dumps_params={"sort_keys": True, "indent": 4},
        )

    @method_decorator(requires_user_role(UserRole.QueueComputeTask))
    def delete(self, request, project_id):
        image_volume_config_id = request.query_params.get(
            "image_volume_config_id", request.data.get("image_volume_config_id", None)
        )

        image_volume = get_object_or_404(ImageVolumeConfig, id=image_volume_config_id)
        image_volume.delete()

        return JsonResponse({"success": True})
