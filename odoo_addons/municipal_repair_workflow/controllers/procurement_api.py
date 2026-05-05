# -*- coding: utf-8 -*-

import json

from odoo import http
from odoo.http import request


def _json_response(payload, status=200):
    return request.make_response(
        json.dumps(payload, default=str),
        headers=[("Content-Type", "application/json; charset=utf-8")],
        status=status,
    )


def _json_body():
    raw = request.httprequest.get_data(as_text=True) or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _error_response(error, status=400):
    return _json_response(
        {
            "ok": False,
            "error": {
                "code": error.__class__.__name__,
                "message": str(error),
            },
        },
        status=status,
    )


class MunicipalProcurementApiController(http.Controller):
    @http.route("/mpw/api/login", type="http", auth="none", methods=["POST"], csrf=False)
    def login(self):
        payload = _json_body()
        try:
            credential = {
                "login": payload.get("login"),
                "password": payload.get("password"),
                "type": "password",
            }
            try:
                uid = request.session.authenticate(payload.get("db") or request.env.cr.dbname, credential)
            except TypeError:
                uid = request.session.authenticate(
                    payload.get("db") or request.env.cr.dbname,
                    payload.get("login"),
                    payload.get("password"),
                )
            if uid:
                request.update_env(user=uid)
            user = request.env.user
            return _json_response(
                {
                    "ok": True,
                    "user": request.env["municipal.procurement.request"]._api_current_user_payload(user),
                }
            )
        except Exception as error:
            return _error_response(error, 401)

    @http.route("/mpw/api/me", type="http", auth="user", methods=["GET"], csrf=False)
    def me(self):
        try:
            return _json_response(
                {
                    "ok": True,
                    "user": request.env["municipal.procurement.request"]._api_current_user_payload(request.env.user),
                }
            )
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/meta", type="http", auth="user", methods=["GET"], csrf=False)
    def meta(self):
        try:
            return _json_response(request.env["municipal.procurement.request"]._api_meta_payload())
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/requests", type="http", auth="user", methods=["GET"], csrf=False)
    def requests(self):
        try:
            payload = request.env["municipal.procurement.request"]._api_list_payload(
                dict(request.httprequest.args)
            )
            return _json_response(payload)
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/requests", type="http", auth="user", methods=["POST"], csrf=False)
    def create_request(self):
        try:
            item = request.env["municipal.procurement.request"]._api_create_request(_json_body())
            return _json_response({"ok": True, "item": item._api_detail_payload()})
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/requests/<int:request_id>", type="http", auth="user", methods=["GET"], csrf=False)
    def request_detail(self, request_id):
        try:
            item = request.env["municipal.procurement.request"].browse(request_id).exists()
            if not item:
                return _error_response(Exception("Purchase request not found."), 404)
            item.check_access_rights("read")
            item.check_access_rule("read")
            return _json_response({"ok": True, "item": item._api_detail_payload()})
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/dashboard", type="http", auth="user", methods=["GET"], csrf=False)
    def dashboard(self):
        try:
            payload = request.env["municipal.procurement.request"]._api_dashboard_payload(
                dict(request.httprequest.args)
            )
            return _json_response(payload)
        except Exception as error:
            return _error_response(error)

    @http.route(
        [
            "/mpw/api/requests/<int:request_id>/submit",
            "/mpw/api/requests/<int:request_id>/move_to_finance_review",
            "/mpw/api/requests/<int:request_id>/prepare_order",
            "/mpw/api/requests/<int:request_id>/director_decision",
            "/mpw/api/requests/<int:request_id>/attach_final_order",
            "/mpw/api/requests/<int:request_id>/mark_contract_signed",
            "/mpw/api/requests/<int:request_id>/mark_paid",
            "/mpw/api/requests/<int:request_id>/mark_received",
            "/mpw/api/requests/<int:request_id>/mark_done",
            "/mpw/api/requests/<int:request_id>/cancel",
        ],
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def workflow_action(self, request_id):
        try:
            item = request.env["municipal.procurement.request"].browse(request_id).exists()
            if not item:
                return _error_response(Exception("Purchase request not found."), 404)
            path = request.httprequest.path.rsplit("/", 1)[-1]
            item._api_run_action(path, _json_body())
            return _json_response({"ok": True, "item": item._api_detail_payload()})
        except Exception as error:
            return _error_response(error)

    @http.route(
        "/mpw/api/requests/<int:request_id>/submit_quotations",
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def submit_quotations(self, request_id):
        try:
            item = request.env["municipal.procurement.request"].browse(request_id).exists()
            if not item:
                return _error_response(Exception("Purchase request not found."), 404)
            item._api_submit_quotations(_json_body())
            return _json_response({"ok": True, "item": item._api_detail_payload()})
        except Exception as error:
            return _error_response(error)

    @http.route(
        "/mpw/api/requests/<int:request_id>/upload_attachment",
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def upload_attachment(self, request_id):
        try:
            item = request.env["municipal.procurement.request"].browse(request_id).exists()
            if not item:
                return _error_response(Exception("Purchase request not found."), 404)
            attachment = item._api_upload_attachment(_json_body())
            return _json_response({"ok": True, "attachment": attachment})
        except Exception as error:
            return _error_response(error)
