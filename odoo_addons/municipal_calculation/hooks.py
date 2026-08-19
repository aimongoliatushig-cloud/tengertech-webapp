# -*- coding: utf-8 -*-

from odoo import api, SUPERUSER_ID

from .seed_materials import MATERIALS


def post_init_hook(env):
    env = api.Environment(env.cr, SUPERUSER_ID, {}) if not hasattr(env, "registry") else env
    sequences = env["ir.sequence"]
    for code, name, prefix, number_next in [
        ("municipal.calculation", "Тооцооллын дугаар", "CAL-%(year)s-", 1),
        ("municipal.calculation.material", "Материалын код", "MAT-", 181),
    ]:
        if not sequences.search_count([("code", "=", code)]):
            sequences.create({"name": name, "code": code, "prefix": prefix, "padding": 4, "number_next": number_next})
    material_model = env["municipal.calculation.material"]
    existing = set(material_model.search([]).mapped("code"))
    material_model.create([
        {"code": code, "name": name, "category": category, "unit": unit, "current_price": 0, "active": True}
        for code, name, category, unit in MATERIALS
        if code not in existing
    ])
