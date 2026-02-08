import { registerArchitectFlows } from './flows/architect';
import { registerEngineerFlows } from './flows/engineer';

export const bootstrap = () => {
    registerArchitectFlows();
    registerEngineerFlows();
};
