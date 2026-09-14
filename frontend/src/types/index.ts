export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type FindingSeverity = 'INFO' | 'WARNING' | 'DANGER';
export type CheckStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedField {
  field_name: string;
  value: string;
  confidence: number;
  bounding_box?: BoundingBox;
  is_validated: boolean;
}

export interface Finding {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  confidence: number;
  signal_source: string;
}

export interface ConsistencyCheck {
  check_name: string;
  status: CheckStatus;
  details: string;
}

export interface ProcessingSummary {
  processing_time_ms: number;
  image_resolution: string;
  signals_evaluated: number;
  ocr_engine: string;
}

export interface CategoryScores {
  tamper_score: number;
  structure_score: number;
  consistency_score: number;
  ocr_score: number;
}

export interface AnomalyOverlays {
  ela_overlay_base64?: string;
  zones_overlay_base64?: string;
}

export interface AnalyzeResponse {
  risk_score: number;
  risk_level: RiskLevel;
  recommendation: string;
  category_scores: CategoryScores;
  extracted_fields: ExtractedField[];
  findings: Finding[];
  consistency_checks: ConsistencyCheck[];
  processing_summary: ProcessingSummary;
  anomaly_overlays?: AnomalyOverlays;
  processed_preview_base64?: string;
}

export interface SampleDocument {
  sample_id: string;
  name: string;
  category: string;
  description: string;
  expected_risk: RiskLevel;
  image_data_url: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  risk_score: number;
  risk_level: string;
  document_type: string;
  summary_findings: string;
  recommendation: string;
}

export interface HealthStatus {
  status: string;
  app: string;
  version: string;
  database: string;
  disclaimer: string;
}
