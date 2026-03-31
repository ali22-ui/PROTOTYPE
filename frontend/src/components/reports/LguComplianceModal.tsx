import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FilePenLine,
  Loader2,
  Lock,
  Send,
  Unlock,
  X,
} from 'lucide-react';
import {
  DotAccreditationFormEditor,
  FlagtFormEditor,
  TiezaFormEditor,
  TpbVisitorRegistrationFormEditor,
  TRAFormEditor,
  VisitorRecordFormEditor,
} from '@/components/reports/editors';
import {
  getCoordinateMapByFormType,
  getTemplateFileByFormType,
} from '@/components/reports/pdfTemplateMaps';
import {
  apiService,
  fetchComplianceForms,
  persistComplianceForms,
  submitMonthlyReportForm,
  updateComplianceForm,
} from '@/services/apiService';
import {
  fillPDF,
  loadTemplate,
  revokePdfUrl,
  triggerPdfDownload,
} from '@/services/pdfService';
import type {
  ComplianceFormDataMap,
  LguComplianceFormRecord,
  LguComplianceFormType,
  LguNotificationStatus,
  MonthlyAggregateData,
} from '@/types';

interface LguComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  enterpriseId: string;
  month: string;
}

const BRAND_DARK = '#2F6B3F';
const BRAND_MID = '#7FB77E';
const BRAND_CREAM = '#FFF6C0';

const getStatusClass = (status: LguComplianceFormRecord['status']): string => {
  if (status === 'SUBMITTED') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === 'DRAFT') {
    return 'bg-amber-100 text-amber-700';
  }

  return 'bg-slate-100 text-slate-700';
};

export default function LguComplianceModal({
  isOpen,
  onClose,
  enterpriseId,
  month,
}: LguComplianceModalProps): JSX.Element | null {
  const [forms, setForms] = useState<LguComplianceFormRecord[]>([]);
  const [aggregate, setAggregate] = useState<MonthlyAggregateData | null>(null);
  const [notificationStatus, setNotificationStatus] =
    useState<LguNotificationStatus>({
      hasLguRequestedReports: false,
      message: 'Checking LGU notification status...',
    });
  const [isLguReady, setIsLguReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [editModes, setEditModes] = useState<Record<string, boolean>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewBlobs, setPreviewBlobs] = useState<Record<string, Blob>>({});

  const templateCacheRef = useRef<Record<string, ArrayBuffer>>({});
  const previewUrlRef = useRef<Record<string, string>>({});

  const clearPreviewCache = useCallback((): void => {
    Object.values(previewUrlRef.current).forEach((url) => revokePdfUrl(url));
    previewUrlRef.current = {};
    setPreviewUrls({});
    setPreviewBlobs({});
  }, []);

  useEffect(() => {
    return () => {
      clearPreviewCache();
    };
  }, [clearPreviewCache]);

  const activeForm = useMemo(
    () => forms.find((item) => item.id === activeId) ?? null,
    [forms, activeId],
  );

  const loadForms = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setIsLguReady(false);
    clearPreviewCache();

    try {
      const [{ forms: loadedForms, aggregate: aggregateData }, lguStatus] =
        await Promise.all([
          fetchComplianceForms(enterpriseId, month),
          apiService.checkLguNotificationStatus(enterpriseId, month),
        ]);

      setForms(loadedForms);
      setAggregate(aggregateData);
      setActiveId(loadedForms[0]?.id ?? null);
      setEditModes({});
      setNotificationStatus(lguStatus);
      setIsLguReady(lguStatus.hasLguRequestedReports === true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to load LGU compliance forms.';
      setError(message);
      setIsLguReady(false);
    } finally {
      setLoading(false);
    }
  }, [clearPreviewCache, enterpriseId, month]);

  useEffect(() => {
    if (!isOpen) {
      setIsLguReady(false);
      return;
    }

    void loadForms();
  }, [isOpen, loadForms]);

  const handleFormDataChange = useCallback(
    <TType extends LguComplianceFormType>(
      formType: TType,
      data: ComplianceFormDataMap[TType],
    ): void => {
      setForms((previous) => {
        const updated = updateComplianceForm(previous, formType, () => data);
        persistComplianceForms(enterpriseId, month, updated);
        return updated;
      });
    },
    [enterpriseId, month],
  );

  const resolveTemplateBytes = useCallback(
    async (formType: LguComplianceFormType): Promise<ArrayBuffer> => {
      const templateFile = getTemplateFileByFormType(formType);
      const cached = templateCacheRef.current[templateFile];

      if (cached) {
        return cached;
      }

      const bytes = await loadTemplate(templateFile);
      templateCacheRef.current[templateFile] = bytes;
      return bytes;
    },
    [],
  );

  const renderFormPdf = useCallback(
    async (form: LguComplianceFormRecord): Promise<Blob> => {
      const templateBytes = await resolveTemplateBytes(form.type);
      const coordinateMap = getCoordinateMapByFormType(form.type);

      const result = await fillPDF(templateBytes, form.data, coordinateMap);

      setPreviewUrls((previous) => {
        const priorUrl = previous[form.id];
        if (priorUrl && priorUrl !== result.blobUrl) {
          revokePdfUrl(priorUrl);
        }

        const next = {
          ...previous,
          [form.id]: result.blobUrl,
        };

        previewUrlRef.current = next;
        return next;
      });

      setPreviewBlobs((previous) => ({
        ...previous,
        [form.id]: result.blob,
      }));

      return result.blob;
    },
    [resolveTemplateBytes],
  );

  useEffect(() => {
    if (!isOpen || !activeForm) {
      return;
    }

    let cancelled = false;
    const debounce = setTimeout(() => {
      setRenderingId(activeForm.id);
      void renderFormPdf(activeForm)
        .catch((err) => {
          if (!cancelled) {
            const message =
              err instanceof Error
                ? err.message
                : 'Failed to render PDF preview.';
            setError(message);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setRenderingId((current) =>
              current === activeForm.id ? null : current,
            );
          }
        });
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [activeForm, isOpen, renderFormPdf]);

  const handleDownload = useCallback(
    async (form: LguComplianceFormRecord): Promise<void> => {
      const existingBlob = previewBlobs[form.id];
      const blob = existingBlob ?? (await renderFormPdf(form));
      triggerPdfDownload(blob, `${form.type}-${form.month}.pdf`);
    },
    [previewBlobs, renderFormPdf],
  );

  const handleSubmit = useCallback(
    async (form: LguComplianceFormRecord): Promise<void> => {
      if (!isLguReady) {
        return;
      }

      setSubmittingId(form.id);
      setError(null);

      try {
        const existingBlob = previewBlobs[form.id];
        const blob = existingBlob ?? (await renderFormPdf(form));
        const result = await submitMonthlyReportForm(
          enterpriseId,
          month,
          form,
          blob,
        );

        setForms((previous) => {
          const submittedStatus: LguComplianceFormRecord['status'] =
            'SUBMITTED';
          const updated: LguComplianceFormRecord[] = previous.map((row) => {
            if (row.id !== form.id) {
              return row;
            }

            return {
              ...row,
              status: submittedStatus,
              submittedAt: result.submittedAt,
              lastUpdated: result.submittedAt,
            };
          });

          persistComplianceForms(enterpriseId, month, updated);
          return updated;
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to submit LGU report.';
        setError(message);
      } finally {
        setSubmittingId(null);
      }
    },
    [enterpriseId, isLguReady, month, previewBlobs, renderFormPdf],
  );

  const lockLabel = useMemo(() => {
    if (isLguReady) {
      return 'LGU request received. Submission is enabled.';
    }

    return (
      notificationStatus.message ||
      'Submission is locked until LGU requests reports.'
    );
  }, [isLguReady, notificationStatus.message]);

  const renderEditor = (form: LguComplianceFormRecord): JSX.Element => {
    switch (form.type) {
      case 'tra':
        return (
          <TRAFormEditor
            data={form.data}
            onChange={(next) => handleFormDataChange('tra', next)}
          />
        );
      case 'dot-accreditation':
        return (
          <DotAccreditationFormEditor
            data={form.data}
            onChange={(next) => handleFormDataChange('dot-accreditation', next)}
          />
        );
      case 'tieza':
        return (
          <TiezaFormEditor
            data={form.data}
            onChange={(next) => handleFormDataChange('tieza', next)}
          />
        );
      case 'flagt':
        return (
          <FlagtFormEditor
            data={form.data}
            onChange={(next) => handleFormDataChange('flagt', next)}
          />
        );
      case 'tpb-registration':
        return (
          <TpbVisitorRegistrationFormEditor
            data={form.data}
            onChange={(next) => handleFormDataChange('tpb-registration', next)}
          />
        );
      case 'visitor-record-attractions':
        return (
          <VisitorRecordFormEditor
            data={form.data}
            onChange={(next) =>
              handleFormDataChange('visitor-record-attractions', next)
            }
          />
        );
      default:
        return (
          <div className="text-sm text-rose-700">Unsupported form type.</div>
        );
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/70 p-4">
      <div className="flex h-[95vh] w-full max-w-384 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header
          className="flex items-start justify-between gap-3 border-b px-5 py-4"
          style={{ backgroundColor: BRAND_DARK }}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-cream">
              LGU Compliance Modal
            </p>
            <h3 className="text-xl font-bold text-white">
              View Monthly Reports - {month}
            </h3>
            {aggregate ? (
              <p className="mt-1 text-xs text-brand-cream">
                Auto-filled from records: {aggregate.totalVisitors} total
                visitors, peak date {aggregate.peakDate}.
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/30 bg-white/10 p-1.5 text-white hover:bg-white/20"
            aria-label="Close compliance modal"
          >
            <X size={18} />
          </button>
        </header>

        <div
          className="border-b px-5 py-2 text-xs"
          style={{ backgroundColor: BRAND_CREAM }}
        >
          <div className="flex items-center gap-2 text-slate-800">
            {isLguReady ? (
              <Unlock size={14} className="text-emerald-700" />
            ) : (
              <Lock size={14} className="text-slate-600" />
            )}
            <span
              className={isLguReady ? 'text-emerald-800' : 'text-slate-700'}
            >
              {lockLabel}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-slate-600">
              Loading official PDF forms...
            </p>
          ) : null}
          {error ? (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="space-y-3">
            {forms.map((form) => {
              const isActive = activeId === form.id;
              const editable = editModes[form.id] ?? false;
              const isSubmitting = submittingId === form.id;
              const isRendering = renderingId === form.id;
              const previewUrl = previewUrls[form.id];

              return (
                <article
                  key={form.id}
                  className="overflow-hidden rounded-2xl border border-slate-300"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setActiveId((previous) =>
                        previous === form.id ? null : form.id,
                      )
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    style={{
                      backgroundColor: isActive ? '#EAF4E5' : '#FFFFFF',
                    }}
                  >
                    <div>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: BRAND_DARK }}
                      >
                        {form.title}
                      </p>
                      <p className="text-xs text-slate-600">
                        {form.description}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(form.status)}`}
                    >
                      {form.status}
                    </span>
                  </button>

                  {isActive ? (
                    <div className="border-t border-slate-200 px-3 pb-3 pt-2">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditModes((previous) => ({
                              ...previous,
                              [form.id]: !(previous[form.id] ?? false),
                            }));
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                          style={{ backgroundColor: BRAND_DARK }}
                        >
                          <FilePenLine size={14} />
                          {editable ? 'Close Editor' : 'Edit'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            void handleDownload(form);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                          style={{ backgroundColor: BRAND_MID }}
                        >
                          <Download size={14} />
                          Download PDF
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            void handleSubmit(form);
                          }}
                          title={
                            isLguReady
                              ? 'Submit this generated PDF to LGU'
                              : 'Submission is locked until LGU requests reports.'
                          }
                          disabled={
                            isSubmitting ||
                            form.status === 'SUBMITTED' ||
                            !isLguReady
                          }
                          className={[
                            'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white',
                            isLguReady
                              ? 'bg-brand-dark hover:bg-brand-mid disabled:cursor-not-allowed disabled:opacity-70'
                              : 'bg-gray-400 cursor-not-allowed',
                          ].join(' ')}
                        >
                          {form.status === 'SUBMITTED' ? (
                            <CheckCircle2 size={14} />
                          ) : (
                            <Send size={14} />
                          )}
                          {form.status === 'SUBMITTED'
                            ? 'Submitted'
                            : isSubmitting
                              ? 'Submitting...'
                              : 'Submit to LGU'}
                        </button>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[minmax(0,70%)_minmax(0,30%)]">
                        <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100 p-2">
                          {isRendering ? (
                            <div className="grid h-[72vh] place-items-center rounded-md bg-white text-slate-600">
                              <div className="flex items-center gap-2 text-sm">
                                <Loader2 size={16} className="animate-spin" />
                                Rendering official PDF preview...
                              </div>
                            </div>
                          ) : previewUrl ? (
                            <iframe
                              title={`${form.title} PDF Preview`}
                              src={previewUrl}
                              className="h-[72vh] w-full rounded-md border border-slate-200 bg-white"
                            />
                          ) : (
                            <div className="grid h-[72vh] place-items-center rounded-md bg-white text-sm text-slate-500">
                              PDF preview will appear here.
                            </div>
                          )}
                        </div>

                        <aside className="overflow-y-auto rounded-xl border border-slate-300 bg-white p-3">
                          {editable ? (
                            <div>
                              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Edit Form Fields
                              </p>
                              {renderEditor(form)}
                            </div>
                          ) : (
                            <div className="grid h-full min-h-60 place-items-center rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">
                              Click{' '}
                              <span
                                className="mx-1 font-semibold"
                                style={{ color: BRAND_DARK }}
                              >
                                Edit
                              </span>
                              to open the field editor. PDF preview updates
                              automatically as you type.
                            </div>
                          )}
                        </aside>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
