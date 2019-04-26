# -*- coding: utf-8 -*-
from catmaid.tests.apis.common import CatmaidApiTestCase


class AutoproofreaderTestCase(CatmaidApiTestCase):
    fixtures = CatmaidApiTestCase.fixtures + ['autoproofreader_testdata.json']

    @classmethod
    def setUpTestData(cls):
        super(AutoproofreaderTestCase, cls).setUpTestData()
