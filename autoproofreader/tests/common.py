# -*- coding: utf-8 -*-
from catmaid.tests.apis.common import CatmaidApiTestCase


class FloodfillingTestCase(CatmaidApiTestCase):
    fixtures = CatmaidApiTestCase.fixtures + ['autoproofreader_testdata.json']

    @classmethod
    def setUpTestData(cls):
        super(FloodfillingTestCase, cls).setUpTestData()
