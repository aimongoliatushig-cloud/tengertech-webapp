# -*- coding: utf-8 -*-

LABOR_RATES = [
    ("Хөрс хуулалт", "хүн/өдөр"), ("Суурь тэгшлэх", "хүн/өдөр"),
    ("Элс дэвсэх", "хүн/өдөр"), ("Хавтан суурилуулах", "хүн/өдөр"),
    ("Бордюр суурилуулах", "хүн/өдөр"), ("Цэвэрлэгээ", "хүн/өдөр"),
    ("Хашаа угсрах", "хүн/өдөр"), ("Шугам хоолой угсрах", "хүн/өдөр"),
    ("Тоноглол суурилуулах", "хүн/өдөр"), ("Ногоон байгууламжийн ажил", "хүн/өдөр"),
]

# Нэр, ангилал, суурь нэгж, гол материалын код, материалын норм, ажлын төрөл, хөдөлмөрийн норм
PACKAGE_SEEDS = [
    ("Явган хүний зам", "Зам талбай", "м²", "MAT-0025", 1.0, "Хавтан суурилуулах", 0.08),
    ("Эко хавтан зам", "Зам талбай", "м²", "MAT-0027", 1.0, "Хавтан суурилуулах", 0.08),
    ("Боржин хавтан зам", "Зам талбай", "м²", "MAT-0031", 1.0, "Хавтан суурилуулах", 0.1),
    ("Бордюр суурилуулах", "Зам талбай", "м", "MAT-0034", 1.0, "Бордюр суурилуулах", 0.1),
    ("Асфальт нөхөөс", "Зам талбай", "м²", "MAT-0040", 0.12, "Суурь тэгшлэх", 0.06),
    ("Зам талбай засвар", "Зам талбай", "м²", "MAT-0039", 0.12, "Суурь тэгшлэх", 0.08),
    ("Төмөр хашаа", "Хашаа", "м", "MAT-0063", 1.0, "Хашаа угсрах", 0.12),
    ("Торон хашаа", "Хашаа", "м", "MAT-0064", 1.0, "Хашаа угсрах", 0.1),
    ("Хамгаалалтын хаалт", "Хашаа", "м", "MAT-0071", 1.0, "Хашаа угсрах", 0.1),
    ("Хашааны хаалга", "Хашаа", "ш", "MAT-0073", 1.0, "Хашаа угсрах", 1.0),
    ("Ус зайлуулах лотки", "Ус зайлуулах", "м", "MAT-0091", 1.0, "Шугам хоолой угсрах", 0.12),
    ("PVC труба суурилуулах", "Ус зайлуулах", "м", "MAT-0097", 1.0, "Шугам хоолой угсрах", 0.08),
    ("Ус зайлуулах суваг", "Ус зайлуулах", "м", "MAT-0092", 1.0, "Шугам хоолой угсрах", 0.15),
    ("Гадна сандал суурилуулах", "Тохижилт", "ш", "MAT-0151", 1.0, "Тоноглол суурилуулах", 0.5),
    ("Хогийн сав суурилуулах", "Тохижилт", "ш", "MAT-0152", 1.0, "Тоноглол суурилуулах", 0.4),
    ("Мэдээллийн самбар суурилуулах", "Тохижилт", "ш", "MAT-0165", 1.0, "Тоноглол суурилуулах", 0.8),
    ("Сүүдрэвч суурилуулах", "Тохижилт", "ш", "MAT-0158", 1.0, "Тоноглол суурилуулах", 2.0),
    ("Цэцгийн мандал хийх", "Тохижилт", "м", "MAT-0154", 1.0, "Ногоон байгууламжийн ажил", 0.1),
    ("Мод тарих", "Ногоон байгууламж", "ш", "MAT-0175", 2.0, "Ногоон байгууламжийн ажил", 0.5),
    ("Мод шилжүүлэн суулгах", "Ногоон байгууламж", "ш", "MAT-0175", 2.0, "Ногоон байгууламжийн ажил", 1.0),
    ("Мод хэлбэржүүлэх", "Ногоон байгууламж", "ш", "MAT-0178", 2.0, "Ногоон байгууламжийн ажил", 0.25),
    ("Зүлэг тарих", "Ногоон байгууламж", "м²", "MAT-0011", 0.05, "Ногоон байгууламжийн ажил", 0.04),
    ("Цэцэг тарих", "Ногоон байгууламж", "ш", "MAT-0180", 1.0, "Ногоон байгууламжийн ажил", 0.03),
    ("Усалгаа", "Ногоон байгууламж", "м³", "MAT-0109", 0.001, "Ногоон байгууламжийн ажил", 0.02),
    ("Бордоо хийх", "Ногоон байгууламж", "м²", "MAT-0180", 0.05, "Ногоон байгууламжийн ажил", 0.02),
]


def seed_labor_and_packages(env):
    labor_model = env["municipal.calculation.labor.rate"]
    for name, unit in LABOR_RATES:
        if not labor_model.search_count([("name", "=", name)]):
            labor_model.create({"name": name, "unit": unit, "current_rate": 0})
    labor_by_name = {record.name: record for record in labor_model.search([])}
    material_by_code = {record.code: record for record in env["municipal.calculation.material"].search([])}
    package_model = env["municipal.calculation.work.package"]
    for name, category, base_unit, material_code, material_norm, labor_name, labor_norm in PACKAGE_SEEDS:
        if package_model.search_count([("name", "=", name)]):
            continue
        material = material_by_code.get(material_code)
        labor = labor_by_name.get(labor_name)
        if not material or not labor:
            continue
        material_lines = [(0, 0, {"material_id": material.id, "norm": material_norm, "unit": material.unit, "unit_price": material.current_price})]
        labor_lines = [(0, 0, {"labor_rate_id": labor.id, "norm": labor_norm, "unit": labor.unit, "unit_price": labor.current_rate, "required": True})]
        if name == "Явган хүний зам":
            extra_materials = [("MAT-0011", 0.05), ("MAT-0002", 0.20), ("MAT-0016", 0.05), ("MAT-0034", 0.10)]
            material_lines += [(0, 0, {"material_id": material_by_code[code].id, "norm": norm, "unit": material_by_code[code].unit, "unit_price": material_by_code[code].current_price}) for code, norm in extra_materials]
            labor_lines = [(0, 0, {"labor_rate_id": labor_by_name[lname].id, "norm": norm, "unit": labor_by_name[lname].unit, "unit_price": labor_by_name[lname].current_rate, "required": True}) for lname, norm in [("Хөрс хуулалт", .05), ("Суурь тэгшлэх", .03), ("Элс дэвсэх", .02), ("Хавтан суурилуулах", .08), ("Бордюр суурилуулах", .10), ("Цэвэрлэгээ", .01)]]
        package_model.create({"name": name, "category": category, "base_unit": base_unit, "description": "Системийн жишиг норматив — администратор батлагдсан нормоор засварлана.", "material_line_ids": material_lines, "labor_line_ids": labor_lines})
