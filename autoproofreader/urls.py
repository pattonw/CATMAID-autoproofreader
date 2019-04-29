# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.conf.urls import url
from autoproofreader.control import (
    compute_server,
    autoproofreader,
    is_installed,
    diluvian_model,
    image_volume_config,
)

app_name = "autoproofreader"

urlpatterns = [url(r"^is-installed$", is_installed)]

# Skeleton flood filling
urlpatterns += [
    url(
        r"^(?P<project_id>\d+)/autoproofreader$",
        autoproofreader.AutoproofreaderTaskAPI.as_view(),
    )
]

# Compute Servers
urlpatterns += [
    url(
        r"^(?P<project_id>\d+)/compute-servers$",
        compute_server.ComputeServerAPI.as_view(),
    ),
    url(r"^(?P<project_id>\d+)/gpu-util$", compute_server.GPUUtilAPI.as_view()),
]

# Floodfilling Models
urlpatterns += [
    url(
        r"^(?P<project_id>\d+)/diluvian-models$",
        diluvian_model.DiluvianModelAPI.as_view(),
    )
]

# Floodfilling Results
urlpatterns += [
    url(
        r"^(?P<project_id>\d+)/autoproofreader-results$",
        autoproofreader.AutoproofreaderResultAPI.as_view(),
    )
]

# Image Volume Configs
urlpatterns += [
    url(
        r"^(?P<project_id>\d+)/image-volume-configs$",
        image_volume_config.ImageVolumeConfigAPI.as_view(),
    )
]
