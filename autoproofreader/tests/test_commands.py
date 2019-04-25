from django.core.management import call_command
from django.apps import apps

from autoproofreader.tests.common import AutoproofreaderTestCase


class CommandsTests(AutoproofreaderTestCase):
    def assert_db_population_state(self, should_exist):
        assertion = self.assertTrue if should_exist else self.assertFalse
        for extensions_model in apps.get_app_config("autoproofreader").get_models():
            assertion(extensions_model.objects.all().exists())

    def test_reset_floodfilling(self):
        self.assert_db_population_state(True)
        call_command("reset_autoproofreader", "-y")
        self.assert_db_population_state(False)
