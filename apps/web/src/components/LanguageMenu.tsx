import { CheckIcon, TranslateIcon } from '../icons';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useState, type MouseEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../i18n/useLanguage';

/**
 * The quick language switch, beside the theme control.
 *
 * It sits in the app bar rather than only in Settings because the person most
 * likely to need it is the one who cannot read the current language — asking
 * them to find Settings → Profile first is asking them to read their way out of
 * the problem. Each option is written in its own language for the same reason.
 */
export default function LanguageMenu(): ReactElement {
  const { t } = useTranslation();
  const { current, languages, change } = useLanguage();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title={t('language.change')}>
        <IconButton
          size="small"
          onClick={(event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)}
          aria-label={t('language.change')}
          aria-haspopup="menu"
          aria-expanded={anchorEl ? 'true' : undefined}
        >
          <TranslateIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {languages.map((language) => (
          <MenuItem
            key={language.code}
            selected={language.code === current.code}
            onClick={() => {
              change(language.code);
              setAnchorEl(null);
            }}
          >
            <ListItemIcon>
              {language.code === current.code ? <CheckIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText primary={language.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
