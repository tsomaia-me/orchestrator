import { registerArchitectFlows } from './flows/architect';
import { registerEngineerFlows } from './flows/engineer';
import { registerInitFlow } from './flows/init';

export const bootstrap = () => {
    registerArchitectFlows();
    registerEngineerFlows();
    registerInitFlow();
};
