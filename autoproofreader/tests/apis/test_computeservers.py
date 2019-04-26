from autoproofreader.tests.common import AutoproofreaderTestCase

URL_PREFIX = "/ext/autoproofreader"


class ComputeServerTest(AutoproofreaderTestCase):
    def test_get(self):
        response = self.client.get(
            "/{project_id}/compute-servers".format(**{"project_id": 0})
        )
        raise Exception(str(response))
        self.assertEqual(response.status_code, 200)

    def test_post(self):
        raise NotImplementedError

    def test_delete(self):
        raise NotImplementedError
