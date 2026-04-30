/**
 * LeadMapView — Geolocation map for field sales reps
 *
 * Features:
 * - OpenStreetMap tiles via react-leaflet (no API key needed)
 * - Lead markers colour-coded by score (green ≥80, amber 50-79, red <50)
 * - Popup per lead with name, company, score, value, and status badge
 * - Rep's current location via browser Geolocation API
 * - Proximity sort panel: shows nearest leads to the rep
 * - Filters: status, score threshold
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin,
  Navigation2,
  TrendingUp,
  Filter,
  ChevronRight,
  AlertCircle,
  Crosshair,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useCRMStore } from '@/store'
import { formatCurrency } from '@/lib/utils'
import { statusStyles, statusLabels } from '@/lib/lead-utils'
import type { Lead } from '@/types'

// ── Fix default Leaflet icon (broken in bundlers) ─────────────────────────────
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Custom score-coloured SVG icon ────────────────────────────────────────────
function makeLeadIcon(score: number, selected = false) {
  const color =
    score >= 80 ? '#22c55e'
    : score >= 50 ? '#f59e0b'
    : '#ef4444'

  const size = selected ? 36 : 28
  const border = selected ? 3 : 1.5
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 54" width="${size}" height="${size * 1.35}">
      <path d="M20 0C9 0 0 9 0 20c0 14 20 34 20 34S40 34 40 20C40 9 31 0 20 0z"
            fill="${color}" stroke="white" stroke-width="${border}"/>
      <circle cx="20" cy="19" r="9" fill="white" fill-opacity="0.9"/>
      <text x="20" y="23" font-size="9" font-family="sans-serif" font-weight="bold"
            fill="${color}" text-anchor="middle">${score}</text>
    </svg>
  `
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size, size * 1.35],
    iconAnchor: [size / 2, size * 1.35],
    popupAnchor: [0, -size],
  })
}

// ── Rep location icon ─────────────────────────────────────────────────────────
const repIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;background:#6366f1;border:3px solid white;border-radius:50%;box-shadow:0 0 0 3px rgba(99,102,241,0.35)"></div>`,
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

// ── Haversine distance in km ──────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── FlyToLead: imperative map fly helper ──────────────────────────────────────
function FlyToLead({ lead }: { lead: Lead | null }) {
  const map = useMap()
  useEffect(() => {
    if (lead?.location) {
      map.flyTo([lead.location.lat, lead.location.lng], 14, { animate: true, duration: 0.8 })
    }
  }, [lead, map])
  return null
}

// ── Score filter options ──────────────────────────────────────────────────────
const scoreFilters = [
  { label: 'All', min: 0 },
  { label: '≥ 50', min: 50 },
  { label: '≥ 70', min: 70 },
  { label: '≥ 85 🔥', min: 85 },
]

const STATUS_FILTER_OPTIONS = ['all', 'new', 'contacted', 'interested', 'qualified', 'proposal']

// ─────────────────────────────────────────────────────────────────────────────

export function LeadMapView() {
  const { leads } = useCRMStore()

  // Leads that have location data
  const locatedLeads = useMemo(
    () => leads.filter((l) => l.location?.lat && l.location?.lng),
    [leads]
  )

  const [repLocation, setRepLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [scoreMin, setScoreMin] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')
  const markerRefs = useRef<Record<string, L.Marker>>({})

  const requestGeo = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRepLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoLoading(false)
      },
      () => {
        setGeoError('Location access denied. Enable it in your browser settings.')
        setGeoLoading(false)
      },
      { timeout: 10_000 }
    )
  }

  const filteredLeads = useMemo(
    () =>
      locatedLeads.filter(
        (l) =>
          l.score >= scoreMin &&
          (statusFilter === 'all' || l.status === statusFilter)
      ),
    [locatedLeads, scoreMin, statusFilter]
  )

  const nearbyLeads = useMemo(() => {
    if (!repLocation) return []
    return [...filteredLeads]
      .map((l) => ({
        lead: l,
        km: haversineKm(repLocation.lat, repLocation.lng, l.location!.lat, l.location!.lng),
      }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5)
  }, [repLocation, filteredLeads])

  // Map default center: centroid of located leads or USA
  const defaultCenter = useMemo<[number, number]>(() => {
    if (locatedLeads.length === 0) return [39.5, -98.35]
    const avgLat = locatedLeads.reduce((s, l) => s + l.location!.lat, 0) / locatedLeads.length
    const avgLng = locatedLeads.reduce((s, l) => s + l.location!.lng, 0) / locatedLeads.length
    return [avgLat, avgLng]
  }, [locatedLeads])

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Score filter */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
          <Filter className="w-3.5 h-3.5 text-muted ml-1" />
          {scoreFilters.map((f) => (
            <button
              key={f.min}
              onClick={() => setScoreMin(f.min)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                scoreMin === f.min
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          {STATUS_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : statusLabels[s as keyof typeof statusLabels] ?? s}
            </option>
          ))}
        </select>

        {/* Geo button */}
        <Button
          size="sm"
          variant="outline"
          onClick={requestGeo}
          disabled={geoLoading}
          className="ml-auto gap-1.5 text-xs"
        >
          {geoLoading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Crosshair className="w-3.5 h-3.5" />
          )}
          {repLocation ? 'Update My Location' : 'My Location'}
        </Button>

        {geoError && (
          <span className="flex items-center gap-1 text-xs text-rose-500">
            <AlertCircle className="w-3.5 h-3.5" /> {geoError}
          </span>
        )}
        {repLocation && (
          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30 gap-1">
            <Navigation2 className="w-3 h-3" /> Location active
          </Badge>
        )}
      </div>

      {/* Map + sidebar layout */}
      <div className="flex gap-4 flex-1 min-h-0" style={{ height: '520px' }}>

        {/* Map */}
        <div className="flex-1 rounded-xl overflow-hidden border border-border min-w-0">
          <MapContainer
            center={defaultCenter}
            zoom={4}
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FlyToLead lead={selectedLead} />

            {/* Rep's location */}
            {repLocation && (
              <>
                <Marker position={[repLocation.lat, repLocation.lng]} icon={repIcon}>
                  <Popup>
                    <div className="text-xs font-medium">📍 Your current location</div>
                  </Popup>
                </Marker>
                <Circle
                  center={[repLocation.lat, repLocation.lng]}
                  radius={50_000}
                  pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.05, weight: 1, dashArray: '6 4' }}
                />
              </>
            )}

            {/* Lead markers */}
            {filteredLeads.map((lead) => (
              <Marker
                key={lead.id}
                position={[lead.location!.lat, lead.location!.lng]}
                icon={makeLeadIcon(lead.score, selectedLead?.id === lead.id)}
                ref={(ref) => { if (ref) markerRefs.current[lead.id] = ref }}
                eventHandlers={{ click: () => setSelectedLead(lead) }}
              >
                <Popup>
                  <div className="min-w-[180px] space-y-1.5 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm">{lead.name}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          lead.score >= 80
                            ? 'bg-emerald-100 text-emerald-700'
                            : lead.score >= 50
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {lead.score}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">{lead.company}</div>
                    <div className="text-xs font-medium text-gray-700">{formatCurrency(lead.value)}</div>
                    <div className="text-xs text-gray-500">📍 {lead.location?.city}</div>
                    <span
                      className={`inline-block text-xs px-1.5 py-0.5 rounded border ${
                        statusStyles[lead.status] ?? ''
                      }`}
                    >
                      {statusLabels[lead.status] ?? lead.status}
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Mapped Leads', value: filteredLeads.length.toString(), icon: MapPin, color: 'text-violet-500' },
              {
                label: 'Avg Score',
                value: filteredLeads.length
                  ? Math.round(filteredLeads.reduce((s, l) => s + l.score, 0) / filteredLeads.length).toString()
                  : '—',
                icon: TrendingUp,
                color: 'text-emerald-500',
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="bg-secondary/30">
                <CardContent className="p-3">
                  <Icon className={`w-4 h-4 mb-1 ${color}`} />
                  <div className="text-lg font-bold">{value}</div>
                  <div className="text-xs text-muted">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Nearby leads */}
          <Card className="flex-1">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Navigation2 className="w-3.5 h-3.5" />
                {repLocation ? 'Nearest to You' : 'All Leads — Enable Location for Route Planning'}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <AnimatePresence mode="popLayout">
                {(repLocation ? nearbyLeads.map(({ lead, km }) => ({ lead, km })) : filteredLeads.slice(0, 5).map((lead) => ({ lead, km: null }))).map(
                  ({ lead, km }) => (
                    <motion.button
                      key={lead.id}
                      layout
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      onClick={() => setSelectedLead(lead)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                        selectedLead?.id === lead.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/40 hover:bg-secondary/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{lead.name}</div>
                          <div className="text-xs text-muted truncate">{lead.company}</div>
                          <div className="text-xs text-muted mt-0.5">📍 {lead.location?.city}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                              lead.score >= 80
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : lead.score >= 50
                                ? 'bg-amber-500/15 text-amber-600'
                                : 'bg-rose-500/15 text-rose-500'
                            }`}
                          >
                            {lead.score}
                          </span>
                          {km !== null && (
                            <span className="text-xs text-muted">{km.toFixed(0)} km</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs font-medium text-foreground">{formatCurrency(lead.value)}</span>
                        <ChevronRight className="w-3 h-3 text-muted" />
                      </div>
                    </motion.button>
                  )
                )}
              </AnimatePresence>

              {filteredLeads.length === 0 && (
                <div className="text-center text-xs text-muted py-6">
                  No leads match the current filters.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
