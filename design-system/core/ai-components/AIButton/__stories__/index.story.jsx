import React from 'react';
import { AIButton } from '@/index';

export const All = () => {
  return <AIButton>AI Button</AIButton>;
};

export default {
  title: 'Components/AI/AI Button/All',
  component: AIButton,
  parameters: {
    docs: {
      docPage: {
        title: 'AIButton',
        props: {
          exclude: ['appearance'],
        },
      },
    },
  },
};
