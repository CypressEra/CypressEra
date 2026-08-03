import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../common/Modal';
import { useSolverSettings, AC_SETTINGS_DEFAULTS } from '../../../contexts/SolverSettingsContext';
import type { ACSettings } from '../../../contexts/SolverSettingsContext';
import './ACPowerFlowSettings.css';

interface ACPowerFlowSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

type FieldError = string | null;

interface FieldErrors {
  tolerance: FieldError;
  max_iterations: FieldError;
  max_outerloop_iterations: FieldError;
  control_tolerance: FieldError;
}

const noErrors: FieldErrors = {
  tolerance: null,
  max_iterations: null,
  max_outerloop_iterations: null,
  control_tolerance: null,
};

type NumericField = 'tolerance' | 'max_iterations' | 'max_outerloop_iterations' | 'control_tolerance';

interface RawValues {
  tolerance: string;
  max_iterations: string;
  max_outerloop_iterations: string;
  control_tolerance: string;
}

const toRaw = (settings: ACSettings): RawValues => ({
  // tolerance is optional; show empty when unset (solver uses RAWX/default).
  tolerance: settings.tolerance != null ? String(settings.tolerance) : '',
  max_iterations: String(settings.max_iterations),
  max_outerloop_iterations: String(settings.max_outerloop_iterations),
  control_tolerance: String(settings.control_tolerance),
});

export const ACPowerFlowSettings: React.FC<ACPowerFlowSettingsProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation('solverSettings');
  const { acSettings, updateACSettings, resetACSettings } = useSolverSettings();

  const [local, setLocal] = useState<ACSettings>({ ...acSettings });
  const [raw, setRaw] = useState<RawValues>(toRaw(acSettings));
  const [errors, setErrors] = useState<FieldErrors>(noErrors);

  useEffect(() => {
    if (isOpen) {
      setLocal({ ...acSettings });
      setRaw(toRaw(acSettings));
      setErrors(noErrors);
    }
  }, [isOpen, acSettings]);

  const validateField = (key: NumericField, rawStr: string) => {
    const trimmed = rawStr.trim();
    // tolerance is optional: an empty value means "unset" — the solver then
    // falls back to the RAWX NEWTON toln, then its own default.
    if (key === 'tolerance' && trimmed === '') {
      setErrors(prev => ({ ...prev, tolerance: null }));
      setLocal(prev => ({ ...prev, tolerance: undefined }));
      updateACSettings({ tolerance: undefined });
      return;
    }
    if (trimmed === '') {
      setErrors(prev => ({ ...prev, [key]: t('validation.invalidNumber') }));
      return;
    }
    const num = Number(trimmed);
    if (Number.isNaN(num)) {
      setErrors(prev => ({ ...prev, [key]: t('validation.invalidNumber') }));
      return;
    }
    if (key === 'tolerance' || key === 'control_tolerance') {
      if (num <= 0) {
        setErrors(prev => ({ ...prev, [key]: t('validation.positiveNumber') }));
        return;
      }
    } else {
      if (!Number.isInteger(num) || num <= 0) {
        setErrors(prev => ({ ...prev, [key]: t('validation.positiveInteger') }));
        return;
      }
    }
    setErrors(prev => ({ ...prev, [key]: null }));
    setLocal(prev => ({ ...prev, [key]: num }));
    updateACSettings({ [key]: num });
  };

  const handleInputChange = (key: NumericField, value: string) => {
    setRaw(prev => ({ ...prev, [key]: value }));
  };

  const handleBlur = (key: NumericField) => {
    validateField(key, raw[key]);
  };

  const handleReset = () => {
    setLocal({ ...AC_SETTINGS_DEFAULTS });
    setRaw(toRaw(AC_SETTINGS_DEFAULTS));
    setErrors(noErrors);
    resetACSettings();
  };

  const handleClose = () => {
    Object.entries(local).forEach(([key, value]) => {
      updateACSettings({ [key]: value });
    });
    onClose();
  };

  const hasErrors = Object.values(errors).some(e => e !== null);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('title')}
      width={640}
      modal={true}
      footer={
        <div className="ac-settings-footer">
          <button className="ac-settings-reset-btn" onClick={handleReset}>
            {t('buttons.resetToDefaults')}
          </button>
          <button className="ac-settings-close-btn" onClick={handleClose} disabled={hasErrors}>
            {t('buttons.close')}
          </button>
        </div>
      }
    >
      <div className="ac-settings-content">
        {/* Convergence */}
        <div className="ac-settings-group">
          <h4 className="ac-settings-group-title">{t('groups.convergence')}</h4>
          <div className="ac-settings-field">
            <label className="ac-settings-label">{t('fields.tolerance.label')}</label>
            <input
              type="text"
              className={`ac-settings-input ${errors.tolerance ? 'ac-settings-input-error' : ''}`}
              value={raw.tolerance}
              onChange={e => handleInputChange('tolerance', e.target.value)}
              onBlur={() => handleBlur('tolerance')}
              placeholder={t('fields.tolerance.placeholder')}
            />
            {errors.tolerance && <span className="ac-settings-error">{errors.tolerance}</span>}
            <span className="ac-settings-description">{t('fields.tolerance.description')}</span>
          </div>
          <div className="ac-settings-field">
            <label className="ac-settings-label">{t('fields.max_iterations.label')}</label>
            <input
              type="text"
              inputMode="numeric"
              className={`ac-settings-input ${errors.max_iterations ? 'ac-settings-input-error' : ''}`}
              value={raw.max_iterations}
              onChange={e => handleInputChange('max_iterations', e.target.value)}
              onBlur={() => handleBlur('max_iterations')}
              placeholder={t('fields.max_iterations.placeholder')}
            />
            {errors.max_iterations && <span className="ac-settings-error">{errors.max_iterations}</span>}
            <span className="ac-settings-description">{t('fields.max_iterations.description')}</span>
          </div>
        </div>

        {/* Initialization */}
        <div className="ac-settings-group">
          <h4 className="ac-settings-group-title">{t('groups.initialization')}</h4>
          <div className="ac-settings-field ac-settings-field-row">
            <div className="ac-settings-toggle-wrap">
              <label className="ac-settings-label">{t('fields.flat_start.label')}</label>
              <span className="ac-settings-description">{t('fields.flat_start.description')}</span>
            </div>
            <label className="ac-settings-toggle">
              <input
                type="checkbox"
                checked={local.flat_start}
                onChange={e => {
                  setLocal(prev => ({ ...prev, flat_start: e.target.checked }));
                  updateACSettings({ flat_start: e.target.checked });
                }}
              />
              <span className="ac-settings-toggle-slider" />
            </label>
          </div>
        </div>

        {/* Control */}
        <div className="ac-settings-group">
          <h4 className="ac-settings-group-title">{t('groups.control')}</h4>
          <div className="ac-settings-field">
            <label className="ac-settings-label">{t('fields.max_outerloop_iterations.label')}</label>
            <input
              type="text"
              inputMode="numeric"
              className={`ac-settings-input ${errors.max_outerloop_iterations ? 'ac-settings-input-error' : ''}`}
              value={raw.max_outerloop_iterations}
              onChange={e => handleInputChange('max_outerloop_iterations', e.target.value)}
              onBlur={() => handleBlur('max_outerloop_iterations')}
              placeholder={t('fields.max_outerloop_iterations.placeholder')}
            />
            {errors.max_outerloop_iterations && <span className="ac-settings-error">{errors.max_outerloop_iterations}</span>}
            <span className="ac-settings-description">{t('fields.max_outerloop_iterations.description')}</span>
          </div>
          <div className="ac-settings-field">
            <label className="ac-settings-label">
              {t('fields.control_tolerance.label')}
              {t('fields.control_tolerance.unit') && (
                <span className="ac-settings-unit"> ({t('fields.control_tolerance.unit')})</span>
              )}
            </label>
            <input
              type="text"
              inputMode="decimal"
              className={`ac-settings-input ${errors.control_tolerance ? 'ac-settings-input-error' : ''}`}
              value={raw.control_tolerance}
              onChange={e => handleInputChange('control_tolerance', e.target.value)}
              onBlur={() => handleBlur('control_tolerance')}
              placeholder={t('fields.control_tolerance.placeholder')}
            />
            {errors.control_tolerance && <span className="ac-settings-error">{errors.control_tolerance}</span>}
            <span className="ac-settings-description">{t('fields.control_tolerance.description')}</span>
          </div>
        </div>

        {/* Solution Options */}
        <div className="ac-settings-group">
          <h4 className="ac-settings-group-title">{t('groups.solutionOptions')}</h4>
          <div className="ac-settings-field">
            <label className="ac-settings-label">{t('fields.tap_adjustment.label')}</label>
            <select
              className="ac-settings-input ac-settings-select"
              value={local.tap_adjustment}
              onChange={e => {
                const v = e.target.value as ACSettings['tap_adjustment'];
                setLocal(prev => ({ ...prev, tap_adjustment: v }));
                updateACSettings({ tap_adjustment: v });
              }}
            >
              <option value="locked">{t('fields.tap_adjustment.options.locked')}</option>
              <option value="stepping">{t('fields.tap_adjustment.options.stepping')}</option>
              <option value="direct">{t('fields.tap_adjustment.options.direct')}</option>
            </select>
            <span className="ac-settings-description">{t('fields.tap_adjustment.description')}</span>
          </div>
          <div className="ac-settings-field ac-settings-field-row">
            <div className="ac-settings-toggle-wrap">
              <label className="ac-settings-label">{t('fields.phase_shift_adjustment.label')}</label>
              <span className="ac-settings-description">{t('fields.phase_shift_adjustment.description')}</span>
            </div>
            <label className="ac-settings-toggle">
              <input
                type="checkbox"
                checked={local.phase_shift_adjustment}
                onChange={e => {
                  setLocal(prev => ({ ...prev, phase_shift_adjustment: e.target.checked }));
                  updateACSettings({ phase_shift_adjustment: e.target.checked });
                }}
              />
              <span className="ac-settings-toggle-slider" />
            </label>
          </div>
          <div className="ac-settings-field ac-settings-field-row">
            <div className="ac-settings-toggle-wrap">
              <label className="ac-settings-label">{t('fields.dc_tap_adjustment.label')}</label>
              <span className="ac-settings-description">{t('fields.dc_tap_adjustment.description')}</span>
            </div>
            <label className="ac-settings-toggle">
              <input
                type="checkbox"
                checked={local.dc_tap_adjustment}
                onChange={e => {
                  setLocal(prev => ({ ...prev, dc_tap_adjustment: e.target.checked }));
                  updateACSettings({ dc_tap_adjustment: e.target.checked });
                }}
              />
              <span className="ac-settings-toggle-slider" />
            </label>
          </div>
          <div className="ac-settings-field">
            <label className="ac-settings-label">{t('fields.switched_shunt_adjustment.label')}</label>
            <select
              className="ac-settings-input ac-settings-select"
              value={local.switched_shunt_adjustment}
              onChange={e => {
                const v = e.target.value as ACSettings['switched_shunt_adjustment'];
                setLocal(prev => ({ ...prev, switched_shunt_adjustment: v }));
                updateACSettings({ switched_shunt_adjustment: v });
              }}
            >
              <option value="lock_all">{t('fields.switched_shunt_adjustment.options.lock_all')}</option>
              <option value="enable_all">{t('fields.switched_shunt_adjustment.options.enable_all')}</option>
              <option value="continuous_only">{t('fields.switched_shunt_adjustment.options.continuous_only')}</option>
            </select>
            <span className="ac-settings-description">{t('fields.switched_shunt_adjustment.description')}</span>
          </div>
          <div className="ac-settings-field">
            <label className="ac-settings-label">{t('fields.area_interchange_adjustment.label')}</label>
            <select
              className="ac-settings-input ac-settings-select"
              value={local.area_interchange_adjustment}
              onChange={e => {
                const v = e.target.value as ACSettings['area_interchange_adjustment'];
                setLocal(prev => ({ ...prev, area_interchange_adjustment: v }));
                updateACSettings({ area_interchange_adjustment: v });
              }}
            >
              <option value="disabled">{t('fields.area_interchange_adjustment.options.disabled')}</option>
              <option value="tie_lines_only">{t('fields.area_interchange_adjustment.options.tie_lines_only')}</option>
              <option value="tie_lines_and_loads">{t('fields.area_interchange_adjustment.options.tie_lines_and_loads')}</option>
            </select>
            <span className="ac-settings-description">{t('fields.area_interchange_adjustment.description')}</span>
          </div>
        </div>
      </div>
    </BaseModal>
  );
};
