/** @odoo-module **/

import { Component, onWillStart, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadCSS, loadJS } from "@web/core/assets";
import { _t } from "@web/core/l10n/translation";

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
// Хан-Уул дүүргийн ойролцоо төв
const DEFAULT_CENTER = [47.88, 106.86];

const OPERATION_COLORS = {
    garbage: "#2563eb",
    garbage_seasonal: "#dc2626",
};
const DEFAULT_COLOR = "#16a34a";

export class MfoDashboard extends Component {
    static template = "municipal_field_ops.Dashboard";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.mapRef = useRef("map");
        this._map = null;
        this._markers = [];

        this.state = useState({
            loading: true,
            error: "",
            mapError: "",
            expandedDept: null,
            data: {
                header: {},
                kpi: {},
                departments: [],
                points: [],
                routes: [],
                vehicles: { rows: [], total: 0, by_state: [] },
                progress: { total: 0, done: 0, open: 0, percent: 0 },
            },
        });

        onWillStart(async () => {
            await this.loadData();
        });

        onMounted(() => {
            this.renderMap();
        });

        onWillUnmount(() => {
            this.destroyMap();
        });
    }

    async loadData() {
        this.state.loading = true;
        this.state.error = "";
        try {
            const data = await this.orm.call("mfo.dashboard", "get_dashboard_data", []);
            this.state.data = data;
        } catch (error) {
            // Самбар бүхэлдээ унахгүй — ойлгомжтой мессеж харуулна.
            this.state.error =
                _t("Хянах самбарын мэдээллийг ачаалж чадсангүй. Дахин оролдоно уу.");
            console.warn("mfo.dashboard load failed", error);
        } finally {
            this.state.loading = false;
        }
    }

    async onRefresh() {
        await this.loadData();
        this.destroyMap();
        this.renderMap();
    }

    // --- Газрын зураг (Leaflet, lazy-load) --------------------------------

    async renderMap() {
        const points = this.state.data.points || [];
        if (!this.mapRef.el || !points.length) {
            return;
        }
        try {
            await loadCSS(LEAFLET_CSS);
            await loadJS(LEAFLET_JS);
        } catch (error) {
            this.state.mapError = _t("Газрын зургийн сан ачаалагдсангүй (интернэт холболт).");
            console.warn("Leaflet load failed", error);
            return;
        }
        const L = window.L;
        if (!L || !this.mapRef.el) {
            return;
        }
        this._map = L.map(this.mapRef.el, { center: DEFAULT_CENTER, zoom: 12 });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap",
            maxZoom: 19,
        }).addTo(this._map);

        const bounds = [];
        for (const point of points) {
            const color = OPERATION_COLORS[point.operation_type] || DEFAULT_COLOR;
            const marker = L.circleMarker([point.lat, point.lng], {
                radius: 6,
                color: "#fff",
                weight: 2,
                fillColor: color,
                fillOpacity: 1,
            }).addTo(this._map);
            marker.bindPopup(
                `<b>${this._escape(point.name)}</b><br/>` +
                    `${this._escape(point.khoroo)}<br/>` +
                    `${this._escape(point.address)}`
            );
            marker.on("click", () => this.openPoint(point.id));
            this._markers.push(marker);
            bounds.push([point.lat, point.lng]);
        }
        if (bounds.length) {
            this._map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
        }
    }

    destroyMap() {
        if (this._map) {
            this._map.remove();
            this._map = null;
            this._markers = [];
        }
    }

    _escape(value) {
        const div = document.createElement("div");
        div.textContent = value || "";
        return div.innerHTML;
    }

    // --- Үйлдлүүд ---------------------------------------------------------

    openPoint(pointId) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "mfo.collection.point",
            res_id: pointId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    openPoints() {
        this.action.doAction("municipal_field_ops.action_mfo_collection_point");
    }

    openRoutes() {
        this.action.doAction("municipal_field_ops.action_mfo_route_execution");
    }

    toggleDepartment(deptId) {
        this.state.expandedDept = this.state.expandedDept === deptId ? null : deptId;
    }
}

registry.category("actions").add("mfo_dashboard", MfoDashboard);
