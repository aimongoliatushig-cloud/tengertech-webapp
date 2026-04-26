# hr_custom_mn

Odoo 19 custom Human Resource Management addon for Mongolian government-style HR records.

The module extends existing `hr.employee` and `hr_holidays` behavior. It intentionally does not depend on Attendance, Payroll, payslips, salary calculation, or biometric attendance integrations.

## Install

```bash
odoo-bin -d <database> -i hr_custom_mn --addons-path=<odoo-addons>,<repo>/odoo_addons
```

## Upgrade

```bash
odoo-bin -d <database> -u hr_custom_mn --addons-path=<odoo-addons>,<repo>/odoo_addons
```
