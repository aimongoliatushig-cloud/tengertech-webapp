# -*- coding: utf-8 -*-
from odoo import api, fields, models


class HrLeave(models.Model):
    _inherit = "hr.leave"

    x_mn_approval_step = fields.Selection(
        [
            ("employee", "Ажилтан илгээсэн"),
            ("manager", "Менежерийн баталгаажуулалт"),
            ("hr", "HR баталгаажуулалт"),
            ("final", "Эцсийн баталгаа"),
            ("refused", "Татгалзсан"),
            ("cancelled", "Цуцалсан"),
        ],
        string="Зөвшөөрлийн шат",
        compute="_compute_x_mn_approval_step",
        store=True,
    )
    x_mn_history_ids = fields.One2many(
        "hr.custom.mn.leave.history",
        "leave_id",
        string="Зөвшөөрлийн түүх",
    )

    @api.depends("state", "validation_type")
    def _compute_x_mn_approval_step(self):
        for leave in self:
            if leave.state == "confirm":
                leave.x_mn_approval_step = "manager"
            elif leave.state == "validate1":
                leave.x_mn_approval_step = "hr"
            elif leave.state == "validate":
                leave.x_mn_approval_step = "final"
            elif leave.state == "refuse":
                leave.x_mn_approval_step = "refused"
            elif leave.state == "cancel":
                leave.x_mn_approval_step = "cancelled"
            else:
                leave.x_mn_approval_step = "employee"

    def _x_mn_log_leave_history(self, action_type, old_state=False, note=False):
        history_values = []
        for leave in self:
            history_values.append(
                {
                    "leave_id": leave.id,
                    "employee_id": leave.employee_id.id,
                    "action_type": action_type,
                    "old_state": old_state or False,
                    "new_state": leave.state,
                    "user_id": self.env.user.id,
                    "note": note or False,
                }
            )
        if history_values:
            self.env["hr.custom.mn.leave.history"].sudo().create(history_values)

    @api.model_create_multi
    def create(self, vals_list):
        leaves = super().create(vals_list)
        leaves._x_mn_log_leave_history("request", note="Чөлөөний хүсэлт үүссэн.")
        return leaves

    def action_approve(self, check_state=True):
        old_states = {leave.id: leave.state for leave in self}
        result = super().action_approve(check_state=check_state)
        for leave in self:
            leave._x_mn_log_leave_history(
                "approve",
                old_state=old_states.get(leave.id),
                note="Чөлөөний хүсэлтийг дараагийн шатанд баталгаажуулсан.",
            )
        return result

    def _action_validate(self, check_state=True):
        old_states = {leave.id: leave.state for leave in self}
        result = super()._action_validate(check_state=check_state)
        for leave in self:
            leave._x_mn_log_leave_history(
                "validate",
                old_state=old_states.get(leave.id),
                note="Чөлөөний хүсэлт эцэслэн батлагдсан.",
            )
        return result

    def action_refuse(self):
        old_states = {leave.id: leave.state for leave in self}
        result = super().action_refuse()
        for leave in self:
            leave._x_mn_log_leave_history(
                "refuse",
                old_state=old_states.get(leave.id),
                note="Чөлөөний хүсэлт татгалзсан.",
            )
        return result


class HrCustomMnLeaveHistory(models.Model):
    _name = "hr.custom.mn.leave.history"
    _description = "HR Leave Approval History"
    _order = "date desc, id desc"

    leave_id = fields.Many2one(
        "hr.leave",
        string="Чөлөө",
        required=True,
        index=True,
        ondelete="cascade",
    )
    employee_id = fields.Many2one("hr.employee", string="Ажилтан", index=True)
    action_type = fields.Selection(
        [
            ("request", "Хүсэлт"),
            ("approve", "Менежер баталсан"),
            ("validate", "HR/эцсийн баталгаа"),
            ("refuse", "Татгалзсан"),
            ("cancel", "Цуцалсан"),
        ],
        string="Үйлдэл",
        required=True,
    )
    old_state = fields.Char(string="Өмнөх төлөв")
    new_state = fields.Char(string="Шинэ төлөв")
    user_id = fields.Many2one("res.users", string="Хэрэглэгч", required=True)
    date = fields.Datetime(string="Огноо", default=fields.Datetime.now, required=True)
    note = fields.Text(string="Тайлбар")
