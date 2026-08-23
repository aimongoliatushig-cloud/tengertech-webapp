from datetime import date

from odoo.tests.common import TransactionCase


class TestGreenCleanWorkTemplate(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.department = cls.env["hr.department"].create(
            {"name": "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс"}
        )
        cls.category = cls.env.ref(
            "municipal_environment_services.green_clean_category_tree_shaping"
        )
        cls.unit = cls.env.ref("municipal_environment_services.green_clean_unit_piece")

    def _template(self, **values):
        defaults = {
            "name": "Мод хэлбэржүүлэлт",
            "code": "test-tree-shaping-%s" % len(self.env["green.clean.work.template"].search([])),
            "department_id": self.department.id,
            "category_id": self.category.id,
            "unit_id": self.unit.id,
            "work_kind": "quantity",
            "frequency": "three_weekly",
            "start_date": date(2026, 8, 17),
            "daily_planned_quantity": 54,
            "total_planned_quantity": 1286,
        }
        defaults.update(values)
        return self.env["green.clean.work.template"].create(defaults)

    def test_three_times_weekly_schedule(self):
        template = self._template()
        self.assertTrue(template._should_generate_on(date(2026, 8, 17)))  # Monday
        self.assertFalse(template._should_generate_on(date(2026, 8, 18)))
        self.assertTrue(template._should_generate_on(date(2026, 8, 19)))  # Wednesday
        self.assertTrue(template._should_generate_on(date(2026, 8, 21)))  # Friday

    def test_monthly_schedule_uses_last_valid_day(self):
        template = self._template(frequency="monthly", day_of_month=31)
        self.assertTrue(template._should_generate_on(date(2026, 9, 30)))
        self.assertFalse(template._should_generate_on(date(2026, 9, 28)))

    def test_duplicate_generation_is_idempotent(self):
        template = self._template(work_kind="recurring", frequency="daily")
        first = template.action_generate_task(date(2026, 8, 19))
        second = template.action_generate_task(date(2026, 8, 19))
        self.assertEqual(first, second)
        self.assertEqual(
            self.env["project.task"].search_count(
                [
                    ("green_clean_template_id", "=", template.id),
                    ("green_clean_scheduled_date", "=", date(2026, 8, 19)),
                ]
            ),
            1,
        )

    def test_thursday_schedule(self):
        thursday = self.env.ref("municipal_environment_services.green_clean_weekday_3")
        template = self._template(
            work_kind="recurring",
            frequency="weekdays",
            weekday_ids=[(6, 0, [thursday.id])],
        )
        self.assertFalse(template._should_generate_on(date(2026, 8, 19)))  # Wednesday
        self.assertTrue(template._should_generate_on(date(2026, 8, 20)))  # Thursday

    def test_semi_monthly_schedule(self):
        template = self._template(work_kind="recurring", frequency="semi_monthly")
        self.assertTrue(template._should_generate_on(date(2026, 8, 15)))
        self.assertTrue(template._should_generate_on(date(2026, 8, 30)))
        self.assertFalse(template._should_generate_on(date(2026, 8, 31)))
