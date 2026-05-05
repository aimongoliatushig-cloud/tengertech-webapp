# -*- coding: utf-8 -*-

{
    "name": "Tengertech Push Notifications",
    "summary": "Web push subscription storage for the municipal PWA",
    "version": "19.0.1.0.0",
    "category": "Productivity",
    "author": "TengerTech",
    "license": "LGPL-3",
    "depends": ["base", "mail", "municipal_core"],
    "data": [
        "security/ir.model.access.csv",
        "security/tengertech_push_notifications_security.xml",
        "views/push_notification_views.xml",
    ],
    "application": False,
    "installable": True,
}
