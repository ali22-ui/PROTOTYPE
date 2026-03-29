import {
  EditorInput,
  EditorNumberInput,
  EditorSection,
  EditorTextarea,
} from './EditorPrimitives';
import type { VisitorRecordFormData } from '@/types';

interface VisitorRecordFormEditorProps {
  data: VisitorRecordFormData;
  onChange: (next: VisitorRecordFormData) => void;
}

function TableRowEditor({
  labelKey,
  maleKey,
  femaleKey,
  localKey,
  touristKey,
  rowTitle,
  data,
  onChange,
}: {
  rowTitle: string;
  labelKey: keyof VisitorRecordFormData;
  maleKey: keyof VisitorRecordFormData;
  femaleKey: keyof VisitorRecordFormData;
  localKey: keyof VisitorRecordFormData;
  touristKey: keyof VisitorRecordFormData;
  data: VisitorRecordFormData;
  onChange: (next: VisitorRecordFormData) => void;
}): JSX.Element {
  return (
    <div className="rounded-md border border-slate-200 p-2">
      <p className="mb-2 text-[11px] font-semibold text-slate-700">{rowTitle}</p>
      <div className="grid grid-cols-5 gap-2">
        <EditorInput
          label="Label"
          value={String(data[labelKey])}
          onChange={(next) => onChange({ ...data, [labelKey]: next })}
        />
        <EditorNumberInput
          label="Male"
          value={Number(data[maleKey])}
          onChange={(next) => onChange({ ...data, [maleKey]: next })}
        />
        <EditorNumberInput
          label="Female"
          value={Number(data[femaleKey])}
          onChange={(next) => onChange({ ...data, [femaleKey]: next })}
        />
        <EditorNumberInput
          label="Local"
          value={Number(data[localKey])}
          onChange={(next) => onChange({ ...data, [localKey]: next })}
        />
        <EditorNumberInput
          label="Tourist"
          value={Number(data[touristKey])}
          onChange={(next) => onChange({ ...data, [touristKey]: next })}
        />
      </div>
    </div>
  );
}

export default function VisitorRecordFormEditor({
  data,
  onChange,
}: VisitorRecordFormEditorProps): JSX.Element {
  return (
    <div className="space-y-3">
      <EditorSection title="Record Header">
        <EditorInput
          label="Attraction Name"
          value={data.attractionName}
          onChange={(attractionName) => onChange({ ...data, attractionName })}
        />
        <EditorInput
          label="Reporting Month"
          value={data.reportingMonth}
          onChange={(reportingMonth) => onChange({ ...data, reportingMonth })}
        />
      </EditorSection>

      <EditorSection title="Monthly Demographic Table (Male/Female/Local/Tourist)">
        <TableRowEditor
          rowTitle="Row 1"
          labelKey="row1Label"
          maleKey="row1Male"
          femaleKey="row1Female"
          localKey="row1Local"
          touristKey="row1Tourist"
          data={data}
          onChange={onChange}
        />
        <TableRowEditor
          rowTitle="Row 2"
          labelKey="row2Label"
          maleKey="row2Male"
          femaleKey="row2Female"
          localKey="row2Local"
          touristKey="row2Tourist"
          data={data}
          onChange={onChange}
        />
        <TableRowEditor
          rowTitle="Row 3"
          labelKey="row3Label"
          maleKey="row3Male"
          femaleKey="row3Female"
          localKey="row3Local"
          touristKey="row3Tourist"
          data={data}
          onChange={onChange}
        />
        <TableRowEditor
          rowTitle="Row 4"
          labelKey="row4Label"
          maleKey="row4Male"
          femaleKey="row4Female"
          localKey="row4Local"
          touristKey="row4Tourist"
          data={data}
          onChange={onChange}
        />
        <TableRowEditor
          rowTitle="Row 5"
          labelKey="row5Label"
          maleKey="row5Male"
          femaleKey="row5Female"
          localKey="row5Local"
          touristKey="row5Tourist"
          data={data}
          onChange={onChange}
        />
      </EditorSection>

      <EditorSection title="Totals & Signatories">
        <div className="grid grid-cols-2 gap-2">
          <EditorNumberInput label="Total Male" value={data.totalMale} onChange={(totalMale) => onChange({ ...data, totalMale })} />
          <EditorNumberInput
            label="Total Female"
            value={data.totalFemale}
            onChange={(totalFemale) => onChange({ ...data, totalFemale })}
          />
          <EditorNumberInput label="Total Local" value={data.totalLocal} onChange={(totalLocal) => onChange({ ...data, totalLocal })} />
          <EditorNumberInput
            label="Total Tourist"
            value={data.totalTourist}
            onChange={(totalTourist) => onChange({ ...data, totalTourist })}
          />
        </div>
        <EditorInput
          label="Prepared By"
          value={data.preparedBy}
          onChange={(preparedBy) => onChange({ ...data, preparedBy })}
        />
        <EditorInput
          label="Approved By"
          value={data.approvedBy}
          onChange={(approvedBy) => onChange({ ...data, approvedBy })}
        />
        <EditorTextarea
          label="Remarks"
          value={data.remarks}
          onChange={(remarks) => onChange({ ...data, remarks })}
          rows={3}
        />
      </EditorSection>
    </div>
  );
}
