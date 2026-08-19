from odoo.addons.municipal_calculation.seed_packages import seed_labor_and_packages

sequences = env["ir.sequence"]
for code, name, prefix, number_next in [
    ("municipal.calculation.labor.rate", "Ажлын хөлсний код", "LAB-", 1),
    ("municipal.calculation.work.package", "Ажлын багцын код", "PKG-", 1),
]:
    if not sequences.search_count([("code", "=", code)]):
        sequences.create({"name": name, "code": code, "prefix": prefix, "padding": 3, "number_next": number_next})
seed_labor_and_packages(env)
env.cr.commit()
print("LABOR_RATES", env["municipal.calculation.labor.rate"].search_count([]))
print("WORK_PACKAGES", env["municipal.calculation.work.package"].search_count([]))
