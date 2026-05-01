# -*- coding: utf-8 -*-
{
    "name": "Хот тохижилтын засвар, агуулахын холбоос",
    "summary": "Машин засварын workflow болон сэлбэг, худалдан авалтын суурь холбоос",
    "version": "19.0.1.0.0",
    "category": "Operations/Municipal",
    "author": "TengerTech",
    "website": "https://tengertech.mn",
    "license": "LGPL-3",
    "depends": [
        "municipal_core",
        "fleet",
        "product",
        "stock",
        "mail",
    ],
    "data": [
        "security/municipal_repair_workflow_security.xml",
        "security/ir.model.access.csv",
        "data/ir_sequence_data.xml",
        "views/municipal_repair_request_views.xml",
        "views/municipal_procurement_request_views.xml",
        "views/fleet_vehicle_views.xml",
        "views/menus.xml",
    ],
    "installable": True,
    "application": False,
}
