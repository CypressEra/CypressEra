import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../BaseModal';
import { Button } from '../../../Button';
import styles from './ParameterEditorModal.module.css';

export interface ParameterCategory {
  name: string;
  fields: ParameterField[];
  /** Optional condition to show/hide this category. Receives current form values. */
  condition?: (values: Record<string, any>) => boolean;
}

export interface ParameterField {
  name: string;
  label: string;
  type?: 'text' | 'int' | 'float' | 'boolean' | 'select';
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string | number; label: string }>;
}

export interface ParameterEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  categories: ParameterCategory[];
  values: Record<string, any>;
  onApply: (values: Record<string, any>) => void;
  width?: number | string;
  height?: number | string;
}

export const ParameterEditorModal: React.FC<ParameterEditorModalProps> = ({
  isOpen,
  onClose,
  title = 'Edit Parameters',
  categories,
  values,
  onApply,
  width = 600,
  height = 500,
}) => {
  const { t } = useTranslation();
  const [currentValues, setCurrentValues] = useState<Record<string, any>>(values);
  const [hasChanges, setHasChanges] = useState(false);

  // Format a number to at most 4 decimals, removing trailing zeros
  const formatNumberValue = (value: any): any => {
    if (value === null || value === undefined || value === '') {
      return value;
    }
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (Number.isNaN(num)) {
      return value;
    }
    // Format to 4 decimals and remove trailing zeros
    const formatted = num.toFixed(4);
    const cleaned = formatted.replace(/\.?0+$/, '');
    return parseFloat(cleaned);
  };

  // Format values when loaded into the modal (limit float fields to 4 decimals)
  useEffect(() => {
    const formattedValues: Record<string, any> = {};
    for (const cat of categories) {
      for (const field of cat.fields) {
        const value = values[field.name];
        if (value !== null && value !== undefined && value !== '') {
          if (field.type === 'float') {
            formattedValues[field.name] = formatNumberValue(value);
          } else {
            formattedValues[field.name] = value;
          }
        } else {
          formattedValues[field.name] = value;
        }
      }
    }
    setCurrentValues(formattedValues);
    setHasChanges(false);
  }, [values, isOpen, categories]);

  const handleFieldChange = (fieldName: string, value: any) => {
    setCurrentValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
    setHasChanges(true);
  };

  const isValueEmpty = (value: any, fieldType?: string): boolean => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (fieldType === 'int' || fieldType === 'float') return value === '';
    return false;
  };

  const requiredFieldsFilled = (): boolean => {
    const visibleCategories = categories.filter(
      (category) => !category.condition || category.condition(currentValues)
    );
    for (const cat of visibleCategories) {
      for (const field of cat.fields) {
        if (field.required && !field.disabled) {
          const value = currentValues[field.name];
          if (isValueEmpty(value, field.type)) return false;
        }
      }
    }
    return true;
  };

  const canApply = hasChanges && requiredFieldsFilled();

  const handleApply = () => {
    onApply(currentValues);
    setHasChanges(false);
    onClose();
  };

  const handleCancel = () => {
    setCurrentValues(values);
    setHasChanges(false);
    onClose();
  };

  const renderField = (field: ParameterField, categoryName: string) => {
    const fieldName = `${categoryName}_${field.name}`;
    const currentValue = currentValues[field.name];
    const fieldType = field.type || 'text';
    const hasUnit = field.unit && fieldType !== 'boolean' && fieldType !== 'select';

    let inputElement;

    switch (fieldType) {
      case 'int':
        inputElement = (
          <input
            type="number"
            className={styles.input}
            value={currentValue ?? ''}
            onChange={(e) => {
              if (e.target.value === '') {
                handleFieldChange(field.name, '');
              } else {
                const val = parseInt(e.target.value, 10);
                handleFieldChange(field.name, Number.isNaN(val) ? '' : val);
              }
            }}
            onBlur={() => {
              // Format int value on blur (though ints typically don't have decimals)
              if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
                const val = parseInt(String(currentValue), 10);
                if (!Number.isNaN(val)) {
                  handleFieldChange(field.name, val);
                }
              }
            }}
            placeholder={field.placeholder}
            disabled={field.disabled}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
          />
        );
        break;
      case 'float':
        inputElement = (
          <input
            type="number"
            className={styles.input}
            value={currentValue ?? ''}
            onChange={(e) => {
              if (e.target.value === '') {
                handleFieldChange(field.name, '');
              } else {
                const val = parseFloat(e.target.value);
                handleFieldChange(field.name, Number.isNaN(val) ? '' : val);
              }
            }}
            onBlur={() => {
              // Format float value to at most 4 decimals when user leaves the field
              if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
                const val = parseFloat(String(currentValue));
                if (!Number.isNaN(val)) {
                  handleFieldChange(field.name, formatNumberValue(val));
                }
              }
            }}
            placeholder={field.placeholder}
            disabled={field.disabled}
            min={field.min}
            max={field.max}
            step={field.step ?? 0.01}
          />
        );
        break;
      case 'boolean':
        inputElement = (
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={!!currentValue}
            onChange={(e) => handleFieldChange(field.name, e.target.checked)}
            disabled={field.disabled}
          />
        );
        break;
      case 'select':
        if (!field.options || field.options.length === 0) {
          console.warn(`Select field ${field.name} has no options defined`);
          inputElement = (
            <input
              type="text"
              className={styles.input}
              value={currentValue ?? ''}
              disabled={true}
              placeholder="No options available"
            />
          );
        } else {
          inputElement = (
            <select
              className={styles.select}
              value={currentValue ?? ''}
              onChange={(e) => {
                const selectedOption = field.options!.find((opt) => String(opt.value) === e.target.value);
                handleFieldChange(field.name, selectedOption?.value ?? e.target.value);
              }}
              disabled={field.disabled}
            >
              {field.options.map((option) => (
                <option key={String(option.value)} value={String(option.value)}>
                  {t(`parameters:fields.${option.label}`)}
                </option>
              ))}
            </select>
          );
        }
        break;
      default:
        inputElement = (
          <input
            type="text"
            className={styles.input}
            value={currentValue ?? ''}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            disabled={field.disabled}
          />
        );
    }

    return (
      <div key={fieldName} className={styles.fieldRow}>
        <label className={styles.fieldLabel}>
          {t(`parameters:fields.${field.label}`)}
          {field.required && !field.disabled && <span className={styles.requiredMark} aria-hidden> *</span>}
        </label>
        <div className={styles.fieldInput}>
          {hasUnit ? (
            <div className={styles.inputWithUnit}>
              {inputElement}
              <span className={styles.unitSuffix}>{field.unit}</span>
            </div>
          ) : (
            inputElement
          )}
        </div>
      </div>
    );
  };

  const footer = (
    <div className={styles.footer}>
      <Button variant="secondary" size="small" onClick={handleCancel}>
        Cancel
      </Button>
      <Button variant="primary" size="small" onClick={handleApply} disabled={!canApply}>
        Apply
      </Button>
    </div>
  );

  const handleEnterKey = () => {
    if (canApply) handleApply();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleCancel}
      title={title}
      width={width}
      height={height}
      modal={true}
      onEnterKey={handleEnterKey}
      footer={footer}
    >
      <div className={styles.content}>
        {categories
          .filter((category) => !category.condition || category.condition(currentValues))
          .map((category) => (
          <div key={category.name} className={styles.category}>
            <h3 className={styles.categoryTitle}>{t(`parameters:categories.${category.name}`)}</h3>
            <div className={styles.fieldsGrid}>
              {category.fields.map((field) => renderField(field, category.name))}
            </div>
          </div>
        ))}
      </div>
    </BaseModal>
  );
};
