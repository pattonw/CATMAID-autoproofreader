from django.core.management import call_command
from django.apps import apps

from floodfilling.tests.common import FloodfillingTestCase


class CommandsTests(FloodfillingTestCase):
    def assert_db_population_state(self, should_exist):
        assertion = self.assertTrue if should_exist else self.assertFalse
        for extensions_model in apps.get_app_config("floodfilling").get_models():
            assertion(extensions_model.objects.all().exists())

    def test_reset_floodfilling(self):
        self.assert_db_population_state(True)
        call_command("reset_floodfilling", "-y")
        self.assert_db_population_state(False)
