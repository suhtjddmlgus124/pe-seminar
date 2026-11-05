``` mermaid
flowchart LR
    subgraph When user uses the app 
        A["Message page (index)"]
    end

    subgraph Running in backgroud
        C((KakaoTalk)) -->|NotificationListener| D[(Check if chatroom exists in table)] -->|Yes| E[(Insert message into table)]
    end

    E --> A
```