import React from 'react';
import { useTranslation } from 'react-i18next';
import { BaseModal } from '../../common/Modal';
import { useVersion } from '../../../hooks/useVersion';
import './About.css';

export interface AboutProps {
  isOpen: boolean;
  onClose: () => void;
}

export const About: React.FC<AboutProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { version, build } = useVersion();

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('about.title')}
      width={420}
      modal={true}
    >
      <div className="about-content">
        <div className="about-header">
          <img src="/logo-full.svg" alt="CypressEra" className="about-logo" />
          <p className="about-subtitle">
            {t('about.subtitle')}
          </p>
        </div>
        

        <div className="about-info">
          <div className="about-info-row">
            <div className="about-info-item">
              <strong>{t('about.version')}</strong>
              <span>{version}</span>
            </div>
            <div className="about-info-item">
              <strong>{t('about.build')}</strong>
              <span className="about-build">{build}</span>
            </div>
          </div>
          <div className="about-info-item about-info-contact">
            <strong>{t('about.contact')}</strong>
            <a href="mailto:support@cypressera.ai">support@cypressera.ai</a>
          </div>
        </div>

        <div className="about-footer">
          <p className="about-copyright">© {new Date().getFullYear()} CypressEra. {t('about.allRightsReserved')}</p>
          <p className="about-location">Vancouver, Canada</p>
        </div>
      </div>
    </BaseModal>
  );
};

