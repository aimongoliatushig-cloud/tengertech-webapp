# -*- coding: utf-8 -*-
{
    "name": "Ажлын хэмжих нэгжийн legacy compatibility",
    "summary": "Legacy ops.work.unit болон ops.work.type model-уудыг одоогийн Odoo registry-д сэргээнэ.",
    "version": "19.0.1.1.1",
    "category": "Operations/Municipal",
    "author": "TengerTech",
    "website": "https://tengertech.mn",
    "license": "LGPL-3",
    "depends": [
        "municipal_field_ops",
    ],
    "data": [
        "security/ops_work_unit_security.xml",
        "security/ir.model.access.csv",
        "views/ops_work_unit_views.xml",
    ],
    "installable": True,
    "application": False,
}
