import json
from guardian.shortcuts import assign_perm

from autoproofreader.tests.common import AutoproofreaderTestCase

IMAGE_VOLUME_CONFIG_URL = "/ext/autoproofreader/{}/image-volume-configs"


class ImageVolumeConfigTest(AutoproofreaderTestCase):
    def test_get(self):
        self.fake_authentication()
        assign_perm("can_browse", self.test_user, self.test_project)

        response = self.client.get(IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id))
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "id": 1,
                "name": "test_volume_1",
                "config": "1",
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2001-01-01T01:01:01.001Z",
                "edition_time": "2002-01-01T01:01:01.001Z",
            },
            {
                "id": 2,
                "name": "test_volume_2",
                "config": "2",
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2002-02-02T02:02:02.002Z",
                "edition_time": "2003-02-02T02:02:02.002Z",
            },
        ]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id),
            {"image_volume_config_id": 1},
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [
            {
                "id": 1,
                "name": "test_volume_1",
                "config": "1",
                "user_id": 3,
                "project_id": 3,
                "creation_time": "2001-01-01T01:01:01.001Z",
                "edition_time": "2002-01-01T01:01:01.001Z",
            }
        ]
        self.assertEqual(expected_result, parsed_response)

    def test_put(self):
        self.fake_authentication()
        assign_perm("can_queue_compute_task", self.test_user, self.test_project)

        # Test putting a image_volumes
        response = self.client.put(
            IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id),
            data={"name": "test_volume_3", "config": "test_config_3"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        print(parsed_response)
        self.assertTrue(parsed_response.get("success", False))
        put_ivc = parsed_response.get("image_volume_config_id")

        # Test retrieving a image_volumes after it has been put
        response = self.client.get(
            IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id),
            {"image_volume_config_id": put_ivc},
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {
            "id": put_ivc,
            "name": "test_volume_3",
            # "config_id": 1,
            "user_id": 3,
            "project_id": 3,
            # "creation_time": "2001-01-01T01:01:01.001Z",
            # "edition_time": "2002-01-01T01:01:01.001Z",
        }

        self.assertEqual(len(parsed_response), 1)
        for k, v in expected_result.items():
            self.assertEqual(v, parsed_response[0][k])

    def test_delete(self):
        self.fake_authentication()
        assign_perm("can_queue_compute_task", self.test_user, self.test_project)

        # Delete a image_volumes
        response = self.client.delete(
            IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id),
            data={"image_volume_config_id": 1},
            content_type="application/json",
        )
        # self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete it again
        response = self.client.delete(
            IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id),
            data={"image_volume_config_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Delete the second image_volumes
        response = self.client.delete(
            IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id),
            data={"image_volume_config_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete it again
        response = self.client.delete(
            IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id),
            data={"image_volume_config_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Assert that there are no more image_volumes
        response = self.client.get(IMAGE_VOLUME_CONFIG_URL.format(self.test_project_id))
        self.assertEqual(len(json.loads(response.content.decode("utf-8"))), 0)
