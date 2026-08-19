from odoo.addons.municipal_calculation.market_prices import (
    MARKET_RATE_DATE,
    MARKET_RATE_SOURCE,
    get_market_rate,
)

materials = env["municipal.calculation.material"].search([("current_price", "=", 0)])
for material in materials:
    material.write({
        "current_price": get_market_rate(material.code, material.category, material.unit),
        "price_source": MARKET_RATE_SOURCE,
        "price_effective_date": MARKET_RATE_DATE,
    })
env.cr.commit()
print("UPDATED_MARKET_PRICES", len(materials))
