import json
from guardian.shortcuts import assign_perm

from autoproofreader.tests.common import AutoproofreaderTestCase

PROOFREAD_TREE_NODES_URL = "/ext/autoproofreader/{}/proofread-tree-nodes"


class ProofreadTreeNodesTest(AutoproofreaderTestCase):
    def test_get(self):
        self.fake_authentication()
        assign_perm("can_browse", self.test_user, self.test_project)

        response = self.client.get(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id)
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [[1], [2], [1], [2]]
        self.assertEqual(expected_result, parsed_response)

        response = self.client.get(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id), {"result_id": 1}
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = [[1], [2]]
        self.assertEqual(expected_result, parsed_response)

    def test_delete(self):
        self.fake_authentication()
        assign_perm("can_queue_compute_task", self.test_user, self.test_project)

        # Delete nodes from a result
        response = self.client.delete(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id),
            data={"result_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete them again
        response = self.client.delete(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id),
            data={"result_id": 1},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Delete nodes from the second result
        response = self.client.delete(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id),
            data={"result_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        parsed_response = json.loads(response.content.decode("utf-8"))
        expected_result = {"success": True}
        self.assertEqual(expected_result, parsed_response)

        # Attempt to delete them again
        response = self.client.delete(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id),
            data={"result_id": 2},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 404)

        # Assert that there are no more nodes
        response = self.client.get(
            PROOFREAD_TREE_NODES_URL.format(self.test_project_id)
        )
        self.assertEqual(len(json.loads(response.content.decode("utf-8"))), 0)
