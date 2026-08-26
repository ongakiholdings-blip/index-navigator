import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';

const BlocklyLoading = observer(() => {
    const { blockly_store } = useStore();
    const { is_loading } = blockly_store;

    if (!is_loading) return null;

    return null;
});

export default BlocklyLoading;
