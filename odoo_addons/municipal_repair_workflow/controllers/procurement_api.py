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


def _procurement_model():
    user_id = request.env.user.id
    procurement = request.env["municipal.procurement.request"]
    before_group_ids = procurement._user_group_ids(request.env.user)
    procurement._ensure_user_job_title_groups(request.env.user)
    after_group_ids = procurement._user_group_ids(request.env.user)
    if after_group_ids != before_group_ids:
        request.update_env(user=user_id)
    return request.env["municipal.procurement.request"]


def _authenticate_session(db_name, login, password):
    credential = {
        "login": login,
        "password": password,
        "type": "password",
    }
    type_errors = []
    for args in ((db_name, credential), (credential,), (db_name, login, password)):
        try:
            return request.session.authenticate(*args)
        except TypeError as error:
            type_errors.append(error)
    if type_errors:
        raise type_errors[-1]
    return False


class MunicipalProcurementApiController(http.Controller):
    @http.route("/mpw/api/login", type="http", auth="none", methods=["POST"], csrf=False)
    def login(self):
        payload = _json_body()
        try:
            uid = _authenticate_session(
                payload.get("db") or request.env.cr.dbname,
                payload.get("login"),
                payload.get("password"),
            )
            if uid:
                request.update_env(user=uid)
            procurement = _procurement_model()
            return _json_response(
                {
                    "ok": True,
                    "user": procurement._api_current_user_payload(request.env.user),
                }
            )
        except Exception as error:
            return _error_response(error, 401)

    @http.route("/mpw/api/me", type="http", auth="user", methods=["GET"], csrf=False)
    def me(self):
        try:
            procurement = _procurement_model()
            return _json_response(
                {
                    "ok": True,
                    "user": procurement._api_current_user_payload(request.env.user),
                }
            )
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/meta", type="http", auth="user", methods=["GET"], csrf=False)
    def meta(self):
        try:
            return _json_response(_procurement_model()._api_meta_payload())
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/suppliers", type="http", auth="user", methods=["GET"], csrf=False)
    def suppliers(self):
        try:
            payload = _procurement_model()._api_list_suppliers(
                dict(request.httprequest.args)
            )
            return _json_response(payload)
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/suppliers", type="http", auth="user", methods=["POST"], csrf=False)
    def create_supplier(self):
        try:
            supplier = _procurement_model()._api_create_supplier(_json_body())
            return _json_response({"ok": True, "supplier": supplier})
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/suppliers/<int:supplier_id>", type="http", auth="user", methods=["PATCH", "DELETE"], csrf=False)
    def supplier_detail(self, supplier_id):
        try:
            procurement = _procurement_model()
            if request.httprequest.method == "DELETE":
                supplier = procurement._api_delete_supplier(supplier_id)
            else:
                supplier = procurement._api_update_supplier(supplier_id, _json_body())
            return _json_response({"ok": True, "supplier": supplier})
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/requests", type="http", auth="user", methods=["GET"], csrf=False)
    def requests(self):
        try:
            payload = _procurement_model()._api_list_payload(
                dict(request.httprequest.args)
            )
            return _json_response(payload)
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/requests", type="http", auth="user", methods=["POST"], csrf=False)
    def create_request(self):
        try:
            item = _procurement_model()._api_create_request(_json_body())
            return _json_response({"ok": True, "item": item._api_detail_payload()})
        except Exception as error:
            return _error_response(error)

    @http.route("/mpw/api/requests/<int:request_id>", type="http", auth="user", methods=["GET"], csrf=False)
    def request_detail(self, request_id):
        try:
            item = _procurement_model().browse(request_id).exists()
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
            payload = _procurement_model()._api_dashboard_payload(
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
            "/mpw/api/requests/<int:request_id>/record_package_ceo_order",
            "/mpw/api/requests/<int:request_id>/director_decision",
            "/mpw/api/requests/<int:request_id>/attach_final_order",
            "/mpw/api/requests/<int:request_id>/mark_contract_signed",
            "/mpw/api/requests/<int:request_id>/mark_paid",
            "/mpw/api/requests/<int:request_id>/mark_received",
            "/mpw/api/requests/<int:request_id>/mark_done",
            "/mpw/api/requests/<int:request_id>/cancel",
            "/mpw/api/requests/<int:request_id>/save_package",
            "/mpw/api/requests/<int:request_id>/delete_package",
        ],
        type="http",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def workflow_action(self, request_id):
        try:
            item = _procurement_model().browse(request_id).exists()
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
            item = _procurement_model().browse(request_id).exists()
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
            item = _procurement_model().browse(request_id).exists()
            if not item:
                return _error_response(Exception("Purchase request not found."), 404)
            attachment = item._api_upload_attachment(_json_body())
            return _json_response({"ok": True, "attachment": attachment})
        except Exception as error:
            return _error_response(error)
