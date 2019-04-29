from django.http import JsonResponse
from rest_framework.views import APIView


class TestAPI(APIView):
    def put(self, request, project_id):
        return JsonResponse(
            {
                "data": request.data,
                "POST": request.POST,
                "query_params": request.query_params,
            }
        )

    def get(self, request, project_id):
        return JsonResponse(
            {
                "data": request.data,
                "POST": request.POST,
                "query_params": request.query_params,
            }
        )

    def delete(self, request, project_id):
        return JsonResponse(
            {
                "data": request.data,
                "POST": request.POST,
                "query_params": request.query_params,
            }
        )
