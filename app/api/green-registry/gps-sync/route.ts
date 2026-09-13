import { NextRequest, NextResponse } from "next/server";

import { fetchGaihamDailyRoutes, type GaihamTrackPoint } from "@/lib/gaiham-fuel-report";
import { executeOdooKw } from "@/lib/odoo";

export const dynamic = "force-dynamic";
const RADIUS_METERS = 20;
const WATERING_PLATES = new Set(["1163УКН", "3561УНД", "6214УЕЕ", "6215УНИ"]);

type Location = { id:number; name:string; gps_latitude:number; gps_longitude:number };
type Visit = { id:number };

function normalize(value:string) { return value.toLocaleUpperCase("mn-MN").replace(/[^\p{L}\p{N}]/gu, ""); }
function radians(value:number) { return value*Math.PI/180; }
function distance(point:GaihamTrackPoint, location:Location) {
  const lat=radians(location.gps_latitude-point.lat), lng=radians(location.gps_longitude-point.lng);
  const a=Math.sin(lat/2)**2+Math.cos(radians(point.lat))*Math.cos(radians(location.gps_latitude))*Math.sin(lng/2)**2;
  return 6_371_000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function today() { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ulaanbaatar"}).format(new Date()); }
function authorized(request:NextRequest) {
  const token=process.env.GAIHAM_SYNC_TOKEN?.trim()||process.env.WRS_SYNC_TOKEN?.trim();
  return Boolean(token&&request.headers.get("authorization")===`Bearer ${token}`);
}

export async function POST(request:NextRequest) {
  if (!authorized(request)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const date=request.nextUrl.searchParams.get("date")||today();
  const [routeResult, locations]=await Promise.all([
    fetchGaihamDailyRoutes(date),
    executeOdooKw<Location[]>("municipal.green.location","search_read",[[["active","=",true],["gps_latitude","!=",0],["gps_longitude","!=",0]]],{fields:["name","gps_latitude","gps_longitude"],limit:1000}),
  ]);
  let created=0, updated=0;
  for (const route of routeResult.routes) {
    const plate=normalize(route.vehicleCode||route.vehicleLabel);
    if (!WATERING_PLATES.has(plate)) continue;
    for (const location of locations) {
      const matches=route.points.map(point=>({point,meters:distance(point,location)})).filter(item=>item.meters<=RADIUS_METERS);
      if (!matches.length) continue;
      const values={name:`${route.vehicleCode} · ${location.name} · ${date}`,location_id:location.id,vehicle_plate:route.vehicleCode,tracker_id:route.trackerId,visit_date:date,entered_at:matches[0].point.getTime,exited_at:matches.at(-1)?.point.getTime||matches[0].point.getTime,closest_meters:Math.min(...matches.map(item=>item.meters)),sample_count:matches.length,source:"Gaiham GPS"};
      const existing=await executeOdooKw<Visit[]>("municipal.green.vehicle.visit","search_read",[[["visit_date","=",date],["vehicle_plate","=",route.vehicleCode],["location_id","=",location.id]]],{fields:["id"],limit:1});
      if (existing[0]) { await executeOdooKw("municipal.green.vehicle.visit","write",[[existing[0].id],values]); updated+=1; }
      else { await executeOdooKw("municipal.green.vehicle.visit","create",[values]); created+=1; }
    }
  }
  return NextResponse.json({ok:true,date,created,updated,radiusMeters:RADIUS_METERS,vehicles:[...WATERING_PLATES]});
}
