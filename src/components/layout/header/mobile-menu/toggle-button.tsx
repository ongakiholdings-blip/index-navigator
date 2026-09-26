import { ComponentProps } from 'react';
import { LegacyMenuHamburger1pxIcon } from '@deriv/quill-icons/Legacy';

type TToggleButton = {
    onClick: ComponentProps<'button'>['onClick'];
};

const ToggleButton = ({ onClick }: TToggleButton) => (
    <button type='button' aria-label='Open settings' onClick={onClick}>
        <LegacyMenuHamburger1pxIcon
            className='mobile-menu__toggle-icon'
            iconSize='sm'
            fill='currentColor'
        />
    </button>
);

export default ToggleButton;
