# -*- coding: utf-8 -*-
{
    "name": "Хот тохижилтын ногоон байгууламж, тохижилтын үйлчилгээ",
    "summary": "Ногоон байгууламж, зам талбай, тохижилтын объект, материал, зурагтай гүйцэтгэлийн бүртгэл",
    "version": "19.0.1.0.0",
    "category": "Operations/Municipal",
    "author": "TengerTech",
    "website": "https://tengertech.mn",
    "license": "LGPL-3",
    "depends": [
        "municipal_core",
        "hr",
        "mail",
    ],
    "data": [
        "security/municipal_environment_services_security.xml",
        "security/ir.model.access.csv",
        "views/municipal_green_views.xml",
        "views/municipal_improvement_views.xml",
        "views/menus.xml",
    ],
    "installable": True,
    "application": False,
}
