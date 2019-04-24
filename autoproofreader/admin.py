from django.contrib import admin

from autoproofreader.models import (
    ComputeServer,
    FloodfillConfig,
    FloodfillModel,
    FloodfillResult,
    VolumeConfig,
)

admin.site.register(ComputeServer)
admin.site.register(FloodfillConfig)
admin.site.register(FloodfillModel)
admin.site.register(FloodfillResult)
admin.site.register(VolumeConfig)
