import loadPlannerProtocol from './core/load_planner_protocol';
import loadReviewerProtocol from './core/load_reviewer_protocol';
import loadEngineerProtocol from './core/load_engineer_protocol';
import awaitEngineerUpdate from './core/await_engineer_update';
import awaitReviewerUpdate from './core/await_reviewer_update';

import createProject from './context/create_project';
import proposeFeature from './context/propose_feature';
import createTask from './context/create_task';
import getProject from './context/get_project';
import getFeature from './context/get_feature';

import postImplementationReport from './reports/post_implementation_report';
import postRejection from './reports/post_rejection';
import postApproval from './reports/post_approval';
import postCommentsResolution from './reports/post_comments_resolution';

export const TOOLS = [
    loadPlannerProtocol,
    loadReviewerProtocol,
    loadEngineerProtocol,
    awaitEngineerUpdate,
    awaitReviewerUpdate,
    createProject,
    proposeFeature,
    createTask,
    getProject,
    getFeature,
    postImplementationReport,
    postRejection,
    postApproval,
    postCommentsResolution
];
