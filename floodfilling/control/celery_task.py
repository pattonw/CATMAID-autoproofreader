# -*- coding: utf-8 -*-
from django.http import JsonResponse

from catmaid.control.authentication import requires_user_role
from catmaid.models import UserRole

from celery.task import task
from celery.task.control import inspect

from rest_framework.decorators import api_view

import time


@api_view(["GET"])
@requires_user_role(UserRole.Browse)
def get_active_tasks(request, project_id):

    i = inspect()
    return JsonResponse(
        i.active(), safe=False, json_dumps_params={"sort_keys": True, "indent": 4}
    )


@api_view(["POST"])
@requires_user_role(UserRole.Browse)
def create_task(request, project_id):
    x = slow_async.delay(request.POST.get("time", 60))
    return JsonResponse({"task": x.task_id})


@task()
def slow_async(delay):
    time.sleep(int(delay))
    return True
