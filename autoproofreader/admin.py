from django.contrib import admin

from autoproofreader.models import (
    ComputeServer,
    ConfigFile,
    DiluvianModel,
    AutoproofreaderResult,
    ImageVolumeConfig,
)

admin.site.register(ComputeServer)
admin.site.register(ConfigFile)
admin.site.register(DiluvianModel)
admin.site.register(AutoproofreaderResult)
admin.site.register(ImageVolumeConfig)
