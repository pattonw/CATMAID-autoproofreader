import datetime
import pytz

from django.core.management.base import BaseCommand
from django.db.models import Q

from autoproofreader.models import AutoproofreaderResult


class Command(BaseCommand):
    help = (
        "Removes results that completed more than 24 "
        + "hours ago and have not been labelled permanent."
    )

    def add_arguments(self, parser):
        parser.add_argument("-y", action="store_true", dest="yes", default=False)

    def handle(self, *args, **options):
        selection = "y" if options["yes"] else "not an option"

        old_results = AutoproofreaderResult.objects.filter(
            Q(
                completion_time__lt=datetime.datetime.now(pytz.utc)
                - datetime.timedelta(days=1)
            )
            & Q(permanent=False)
        )

        while selection.lower() not in ["y", "n", ""]:
            selection = input(
                (
                    "This will remove {} old results not marked "
                    + "permanent. Are you sure ([y]/n)? "
                ).format(len(old_results))
            )

        if selection == "n":
            self.stdout.write(self.style.FAILURE("Aborting"))
            return
        else:
            old_results.delete()
