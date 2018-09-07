from django.http import JsonResponse
from django.db import connection
from django.shortcuts import get_object_or_404

from catmaid.control.common import get_request_bool, urljoin
from catmaid.control.authentication import requires_user_role
from catmaid.models import Message, User, UserRole
from floodfilling.models import ComputeServer
from catmaid.control.message import notify_user

from celery.task import task

from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view

import time


@api_view(["POST"])
@requires_user_role(UserRole.Browse)
def add_compute_server(request, project_id):
    address = request.POST.get("address")
    if "name" in request.POST:
        name = request.POST.get("name")
    else:
        name = address.split(".")[0]

    server = ComputeServer(name=name, address=address, editor=request.user)
    server.save()

    return JsonResponse({"success": True})


@api_view(["GET"])
@requires_user_role(UserRole.Browse)
def get_compute_servers(request, project_id):

    cursor = connection.cursor()
    cursor.execute(
        """
        SELECT * FROM compute_server
    """
    )
    result = []
    for row in cursor.fetchall():
        result.append({"id": row[0], "name": row[1], "address": row[2]})

    return JsonResponse(
        result, safe=False, json_dumps_params={"sort_keys": True, "indent": 4}
    )


@api_view(["DELETE"])
@requires_user_role(UserRole.Browse)
def delete_compute_server(request, project_id, server_id):
    # can_edit_or_fail(request.user, point_id, "point")

    server = get_object_or_404(ComputeServer, id=server_id)
    server.delete()

    return JsonResponse({"success": True})


def get_server(server_id):
    cursor = connection.cursor()
    cursor.execute(
        """
        SELECT * FROM compute_server
        WHERE id = {}
    """.format(
            server_id
        )
    )
    result = []
    for row in cursor.fetchall():
        result.append({"id": row[0], "name": row[1], "address": row[2]})

    assert len(result) == 1
    return result[0]
