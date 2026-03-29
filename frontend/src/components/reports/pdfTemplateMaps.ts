import type {
  ComplianceFormCoordinateOffsets,
  ComplianceFormCoordinateMaps,
  ComplianceFormDataMap,
  ComplianceFormTemplateFiles,
  LguComplianceFormType,
  PdfCoordinateMap,
} from '@/types';

const COMPLIANCE_COORDINATE_OFFSETS: ComplianceFormCoordinateOffsets = {
  tra: { x: 0, y: 0 },
  'dot-accreditation': { x: 1, y: -4 },
  tieza: { x: 1, y: -6 },
  flagt: { x: 1, y: -6 },
  'tpb-registration': { x: 1, y: -5 },
  'visitor-record-attractions': { x: 0, y: 0 },
};

const applyCoordinateOffset = <TData extends object>(
  coordinateMap: PdfCoordinateMap<TData>,
  offset: { x: number; y: number },
): PdfCoordinateMap<TData> => {
  const adjustedMap: PdfCoordinateMap<TData> = {};

  (Object.keys(coordinateMap) as Array<Extract<keyof TData, string>>).forEach((field) => {
    const coordinate = coordinateMap[field];
    if (!coordinate) {
      return;
    }

    adjustedMap[field] = {
      ...coordinate,
      x: coordinate.x + offset.x,
      y: coordinate.y + offset.y,
    };
  });

  return adjustedMap;
};

export const COMPLIANCE_TEMPLATE_FILES: ComplianceFormTemplateFiles = {
  tra: 'Tourism Rapid Assessment (TRA) Form.pdf',
  'dot-accreditation': 'DOT Accreditation Forms.pdf',
  tieza: 'TEZ-Application-Form.pdf',
  flagt: 'Forest Landuse Agreement for Tourism Purposes (FLAgT).pdf',
  'tpb-registration': 'Visitor Registration Form (TPB).pdf',
  'visitor-record-attractions': 'Visitor Record Form for Attractions.pdf',
};

const BASE_COMPLIANCE_COORDINATE_MAPS: ComplianceFormCoordinateMaps = {
  tra: {
    siteName: { page: 0, x: 110, y: 742, size: 10 },
    region: { page: 0, x: 78, y: 706, size: 10 },
    provinceCity: { page: 0, x: 230, y: 706, size: 10 },
    barangay: { page: 0, x: 435, y: 706, size: 10 },
    latitude: { page: 0, x: 95, y: 682, size: 10 },
    longitude: { page: 0, x: 260, y: 682, size: 10 },
    climate: { page: 0, x: 435, y: 682, size: 10 },
    actualVisitorCount: { page: 0, x: 175, y: 658, size: 10 },
    assessmentDate: { page: 0, x: 355, y: 658, size: 10 },
    assessorName: { page: 0, x: 110, y: 635, size: 10 },
    keyNaturalValues: { page: 0, x: 40, y: 598, size: 9, maxWidth: 250, lineHeight: 11 },
    keyCulturalValues: { page: 0, x: 315, y: 598, size: 9, maxWidth: 250, lineHeight: 11 },
    totalAreaHectares: { page: 0, x: 190, y: 165, size: 10 },
    coreZoneHectares: { page: 0, x: 190, y: 145, size: 10 },
    bufferZoneHectares: { page: 0, x: 190, y: 125, size: 10 },
    existingFacilities: { page: 0, x: 190, y: 105, size: 9, maxWidth: 360, lineHeight: 11 },
  },
  'dot-accreditation': {
    establishmentName: { page: 0, x: 145, y: 742, size: 10 },
    accreditationNo: { page: 0, x: 430, y: 742, size: 10 },
    reportingMonth: { page: 0, x: 110, y: 720, size: 10 },
    managingEntity: { page: 0, x: 280, y: 720, size: 10 },
    contactNumber: { page: 0, x: 455, y: 720, size: 10 },
    contactEmail: { page: 0, x: 120, y: 700, size: 10 },
    firstAidKit: { page: 0, x: 177, y: 650, size: 12 },
    fireExtinguishers: { page: 0, x: 461, y: 650, size: 12 },
    evacuationPlan: { page: 0, x: 177, y: 630, size: 12 },
    cctvMonitoring: { page: 0, x: 461, y: 630, size: 12 },
    trainedFrontliners: { page: 0, x: 177, y: 610, size: 12 },
    incidentLogbook: { page: 0, x: 461, y: 610, size: 12 },
    male: { page: 0, x: 150, y: 560, size: 10 },
    female: { page: 0, x: 425, y: 560, size: 10 },
    localResidents: { page: 0, x: 150, y: 536, size: 10 },
    nonLocalResidents: { page: 0, x: 425, y: 536, size: 10 },
    foreignGuests: { page: 0, x: 150, y: 513, size: 10 },
    miceDelegates: { page: 0, x: 425, y: 513, size: 10 },
    complianceRemarks: { page: 0, x: 40, y: 445, size: 9, maxWidth: 520, lineHeight: 11 },
  },
  tieza: {
    enterpriseName: { page: 0, x: 155, y: 742, size: 10 },
    enterpriseZoneLocation: { page: 0, x: 185, y: 717, size: 10 },
    landAreaHectares: { page: 0, x: 135, y: 695, size: 10 },
    investmentPriority: { page: 0, x: 150, y: 672, size: 10 },
    roadAccess: { page: 0, x: 58, y: 630, size: 12 },
    utilityConnection: { page: 0, x: 302, y: 630, size: 12 },
    wasteManagement: { page: 0, x: 58, y: 612, size: 12 },
    emergencyResponse: { page: 0, x: 302, y: 612, size: 12 },
    infrastructureNotes: { page: 0, x: 40, y: 570, size: 9, maxWidth: 520, lineHeight: 11 },
    authorizedRepresentative: { page: 0, x: 240, y: 160, size: 10 },
    dateSigned: { page: 0, x: 240, y: 140, size: 10 },
  },
  flagt: {
    proponentName: { page: 0, x: 145, y: 742, size: 10 },
    projectName: { page: 0, x: 430, y: 742, size: 10 },
    municipalityProvince: { page: 0, x: 170, y: 718, size: 10 },
    landAreaRequestedHectares: { page: 0, x: 455, y: 718, size: 10 },
    tenureInstrument: { page: 0, x: 132, y: 695, size: 10 },
    forestLandClassification: { page: 0, x: 392, y: 695, size: 10 },
    declarationAccepted: { page: 0, x: 42, y: 646, size: 12 },
    environmentalSafeguards: { page: 0, x: 42, y: 628, size: 12 },
    communityConsultation: { page: 0, x: 42, y: 610, size: 12 },
    signatureName: { page: 0, x: 270, y: 185, size: 10 },
    signatureDate: { page: 0, x: 270, y: 165, size: 10 },
  },
  'tpb-registration': {
    eventName: { page: 0, x: 115, y: 742, size: 10 },
    eventType: { page: 0, x: 410, y: 742, size: 10 },
    organizer: { page: 0, x: 95, y: 720, size: 10 },
    venue: { page: 0, x: 350, y: 720, size: 10 },
    eventStartDate: { page: 0, x: 125, y: 698, size: 10 },
    eventEndDate: { page: 0, x: 380, y: 698, size: 10 },
    meeting: { page: 0, x: 66, y: 655, size: 12 },
    incentive: { page: 0, x: 188, y: 655, size: 12 },
    conference: { page: 0, x: 315, y: 655, size: 12 },
    exhibition: { page: 0, x: 440, y: 655, size: 12 },
    localMale: { page: 0, x: 224, y: 602, size: 10 },
    localFemale: { page: 0, x: 318, y: 602, size: 10 },
    localTotal: { page: 0, x: 432, y: 602, size: 10 },
    nonLocalMale: { page: 0, x: 224, y: 580, size: 10 },
    nonLocalFemale: { page: 0, x: 318, y: 580, size: 10 },
    nonLocalTotal: { page: 0, x: 432, y: 580, size: 10 },
    foreignMale: { page: 0, x: 224, y: 558, size: 10 },
    foreignFemale: { page: 0, x: 318, y: 558, size: 10 },
    foreignTotal: { page: 0, x: 432, y: 558, size: 10 },
    remarks: { page: 0, x: 40, y: 500, size: 9, maxWidth: 520, lineHeight: 11 },
  },
  'visitor-record-attractions': {
    attractionName: { page: 0, x: 140, y: 742, size: 10 },
    reportingMonth: { page: 0, x: 415, y: 742, size: 10 },
    row1Label: { page: 0, x: 58, y: 676, size: 9 },
    row1Male: { page: 0, x: 248, y: 676, size: 9 },
    row1Female: { page: 0, x: 318, y: 676, size: 9 },
    row1Local: { page: 0, x: 402, y: 676, size: 9 },
    row1Tourist: { page: 0, x: 492, y: 676, size: 9 },
    row2Label: { page: 0, x: 58, y: 654, size: 9 },
    row2Male: { page: 0, x: 248, y: 654, size: 9 },
    row2Female: { page: 0, x: 318, y: 654, size: 9 },
    row2Local: { page: 0, x: 402, y: 654, size: 9 },
    row2Tourist: { page: 0, x: 492, y: 654, size: 9 },
    row3Label: { page: 0, x: 58, y: 632, size: 9 },
    row3Male: { page: 0, x: 248, y: 632, size: 9 },
    row3Female: { page: 0, x: 318, y: 632, size: 9 },
    row3Local: { page: 0, x: 402, y: 632, size: 9 },
    row3Tourist: { page: 0, x: 492, y: 632, size: 9 },
    row4Label: { page: 0, x: 58, y: 610, size: 9 },
    row4Male: { page: 0, x: 248, y: 610, size: 9 },
    row4Female: { page: 0, x: 318, y: 610, size: 9 },
    row4Local: { page: 0, x: 402, y: 610, size: 9 },
    row4Tourist: { page: 0, x: 492, y: 610, size: 9 },
    row5Label: { page: 0, x: 58, y: 588, size: 9 },
    row5Male: { page: 0, x: 248, y: 588, size: 9 },
    row5Female: { page: 0, x: 318, y: 588, size: 9 },
    row5Local: { page: 0, x: 402, y: 588, size: 9 },
    row5Tourist: { page: 0, x: 492, y: 588, size: 9 },
    totalMale: { page: 0, x: 248, y: 544, size: 10 },
    totalFemale: { page: 0, x: 318, y: 544, size: 10 },
    totalLocal: { page: 0, x: 402, y: 544, size: 10 },
    totalTourist: { page: 0, x: 492, y: 544, size: 10 },
    preparedBy: { page: 0, x: 140, y: 140, size: 10 },
    approvedBy: { page: 0, x: 385, y: 140, size: 10 },
    remarks: { page: 0, x: 40, y: 108, size: 9, maxWidth: 520, lineHeight: 11 },
  },
};

export const COMPLIANCE_COORDINATE_MAPS: ComplianceFormCoordinateMaps = {
  tra: applyCoordinateOffset<ComplianceFormDataMap['tra']>(
    BASE_COMPLIANCE_COORDINATE_MAPS.tra,
    COMPLIANCE_COORDINATE_OFFSETS.tra,
  ),
  'dot-accreditation': applyCoordinateOffset<ComplianceFormDataMap['dot-accreditation']>(
    BASE_COMPLIANCE_COORDINATE_MAPS['dot-accreditation'],
    COMPLIANCE_COORDINATE_OFFSETS['dot-accreditation'],
  ),
  tieza: applyCoordinateOffset<ComplianceFormDataMap['tieza']>(
    BASE_COMPLIANCE_COORDINATE_MAPS.tieza,
    COMPLIANCE_COORDINATE_OFFSETS.tieza,
  ),
  flagt: applyCoordinateOffset<ComplianceFormDataMap['flagt']>(
    BASE_COMPLIANCE_COORDINATE_MAPS.flagt,
    COMPLIANCE_COORDINATE_OFFSETS.flagt,
  ),
  'tpb-registration': applyCoordinateOffset<ComplianceFormDataMap['tpb-registration']>(
    BASE_COMPLIANCE_COORDINATE_MAPS['tpb-registration'],
    COMPLIANCE_COORDINATE_OFFSETS['tpb-registration'],
  ),
  'visitor-record-attractions': applyCoordinateOffset<ComplianceFormDataMap['visitor-record-attractions']>(
    BASE_COMPLIANCE_COORDINATE_MAPS['visitor-record-attractions'],
    COMPLIANCE_COORDINATE_OFFSETS['visitor-record-attractions'],
  ),
};

export const getTemplateFileByFormType = (formType: LguComplianceFormType): string => {
  const templateFile = COMPLIANCE_TEMPLATE_FILES[formType];
  if (!templateFile) {
    throw new Error(`Missing PDF template mapping for form type: ${String(formType)}`);
  }

  return templateFile;
};

export const getCoordinateMapByFormType = (formType: LguComplianceFormType) => {
  const coordinateMap = COMPLIANCE_COORDINATE_MAPS[formType];
  if (!coordinateMap) {
    throw new Error(`Missing coordinate map for form type: ${String(formType)}`);
  }

  return coordinateMap;
};
