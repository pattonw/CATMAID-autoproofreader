# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.conf.urls import url
from floodfilling.control import compute_server, floodfilling, celery_task, is_installed

app_name = "floodfilling"

urlpatterns = [url(r"^is-installed$", is_installed)]

# Skeleton flood filling
urlpatterns += [
    url(r"^(?P<project_id>\d+)/flood-fill$", floodfilling.flood_fill_skeleton)
]

# Compute Servers
urlpatterns += [
    url(r"^(?P<project_id>\d+)/add-compute-server$", compute_server.add_compute_server),
    url(r"^(?P<project_id>\d+)/compute-servers$", compute_server.get_compute_servers),
    url(
        r"^(?P<project_id>\d+)/remove-compute-server/(?P<server_id>\d+)$",
        compute_server.delete_compute_server,
    ),
]

# Celery Tasks
urlpatterns += [
    url(r"^(?P<project_id>\d+)/tasks$", celery_task.get_active_tasks),
    url(r"^(?P<project_id>\d+)/create-task$", celery_task.create_task),
]
