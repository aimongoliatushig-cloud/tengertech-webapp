# -*- coding: utf-8 -*-
{
    "name": "Хот тохижилтын үндсэн модуль",
    "summary": "Хот тохижилтын ажил, тайлан, ирц, сахилга, эрхийн суурь модуль",
    "version": "19.0.1.0.1",
    "category": "Operations/Municipal",
    "author": "TengerTech",
    "website": "https://tengertech.mn",
    "license": "LGPL-3",
    "depends": [
        "base",
        "hr",
        "mail",
    ],
    "data": [
        "security/municipal_core_security.xml",
        "security/ir.model.access.csv",
        "views/municipal_work_type_views.xml",
        "views/municipal_work_report_views.xml",
        "views/municipal_work_views.xml",
        "views/municipal_attendance_issue_views.xml",
        "views/municipal_discipline_views.xml",
        "views/municipal_hr_employee_views.xml",
        "views/menus.xml",
    ],
    "installable": True,
    "application": True,
}
