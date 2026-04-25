/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

function normalizeChart(items) {
    const values = (items || []).map((item) => Number(item.value || 0));
    const maxValue = Math.max(...values, 1);
    return (items || []).map((item) => ({
        ...item,
        percent: Math.round((Number(item.value || 0) / maxValue) * 100),
    }));
}

class HrCustomMnDashboard extends Component {
    setup() {
        this.orm = useService("orm");
        this.state = useState({ loading: true, data: {} });
        onWillStart(async () => {
            const data = await this.orm.call("hr.employee", "get_hr_custom_mn_dashboard_data", [], {});
            this.state.data = {
                ...data,
                departmentHeadcount: normalizeChart(data.departmentHeadcount),
                educationLevel: normalizeChart(data.educationLevel),
                ageDistribution: normalizeChart(data.ageDistribution),
                leaveStatistics: normalizeChart(data.leaveStatistics),
                monthlyHiringTrend: normalizeChart(data.monthlyHiringTrend),
            };
            this.state.loading = false;
        });
    }
}
HrCustomMnDashboard.template = "hr_custom_mn.Dashboard";

class HrCustomMnOrgChart extends Component {
    setup() {
        this.orm = useService("orm");
        this.state = useState({ loading: true, data: {} });
        onWillStart(async () => {
            this.state.data = await this.orm.call("hr.employee", "get_hr_custom_mn_org_chart_data", [], {});
            this.state.loading = false;
        });
    }
}
HrCustomMnOrgChart.template = "hr_custom_mn.OrgChart";

registry.category("actions").add("hr_custom_mn_dashboard", HrCustomMnDashboard);
registry.category("actions").add("hr_custom_mn_org_chart", HrCustomMnOrgChart);
